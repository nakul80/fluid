import { useSyncExternalStore } from 'react';
import { compute, dependents, Engine, validate } from './domain/engine';
import { seed } from './domain/seed';
import { Data, Doc, DocType, DOC_META, Item, Ledger } from './domain/types';

export type View =
  | { name: 'dashboard' }
  | { name: 'docs'; filter?: string }
  | { name: 'doc'; id?: string; type: DocType; prefill?: Partial<Doc>; edit?: boolean }
  | { name: 'cycle'; side: 'purchase' | 'sales' }
  | { name: 'report'; report: 'tb' | 'pl' | 'bs' | 'stock' | 'receivable' | 'payable' }
  | { name: 'ledger'; id: string }
  | { name: 'item'; id: string }
  | { name: 'masters'; kind: 'ledgers' | 'items' }
  | { name: 'ledgerForm'; id?: string; groupId?: string }
  | { name: 'itemForm'; id?: string };

interface State {
  data: Data;
  eng: Engine;
  nav: View[];
  toast?: { text: string; tone: 'good' | 'bad'; at: number };
  palette: boolean;
}

const KEY = 'fluid-erp:v1';

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable: fall back to demo data */ }
  return seed();
}

function persist(d: Data) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

const initial = load();
let state: State = { data: initial, eng: compute(initial), nav: [{ name: 'dashboard' }], palette: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useStore = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);

export const getState = () => state;

function commit(data: Data) {
  persist(data);
  set({ data, eng: compute(data) });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, tone: 'good' | 'bad' = 'good') {
  set({ toast: { text, tone, at: Date.now() } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => set({ toast: undefined }), 3200);
}

export const nav = {
  go(v: View) { set({ nav: [...state.nav, v].slice(-30), palette: false }); },
  replace(v: View) { set({ nav: [...state.nav.slice(0, -1), v] }); },
  back() { if (state.nav.length > 1) set({ nav: state.nav.slice(0, -1) }); },
  home(v?: View) { set({ nav: v ? [{ name: 'dashboard' }, v] : [{ name: 'dashboard' }], palette: false }); },
};

export const setPalette = (open: boolean) => set({ palette: open });

const nowISO = () => new Date().toISOString();
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Validate and save a document. Returns errors, or the saved doc. */
export function saveDoc(draft: Doc): { errors: string[]; doc?: Doc } {
  const data = structuredClone(state.data);
  let doc: Doc;
  const existing = data.docs.findIndex((d) => d.id === draft.id);
  if (existing >= 0) {
    doc = { ...draft, audit: [...draft.audit, { at: nowISO(), action: 'edited' }] };
    data.docs[existing] = doc;
  } else {
    const n = (data.seq[draft.type] ?? 0) + 1;
    doc = {
      ...draft,
      id: uid(draft.type),
      number: `${DOC_META[draft.type].prefix}-${String(n).padStart(4, '0')}`,
      status: 'posted',
      audit: [{ at: nowISO(), action: 'created' }],
    };
    data.seq[draft.type] = n;
    data.docs.push(doc);
  }
  const eng = compute(data);
  const errors = validate(data, eng, doc.id);
  if (errors.length) return { errors };
  commit(data);
  return { errors: [], doc };
}

export function cancelDoc(id: string, reason: string): string | null {
  const deps = dependents(state.data, id);
  if (deps.length) return `Cancel ${deps.map((d) => d.number).join(', ')} first; ${deps.length > 1 ? 'they depend' : 'it depends'} on this document.`;
  const data = structuredClone(state.data);
  const d = data.docs.find((x) => x.id === id)!;
  d.status = 'cancelled';
  d.audit.push({ at: nowISO(), action: 'cancelled', note: reason });
  commit(data);
  return null;
}

export function saveLedger(l: Ledger): string | null {
  if (!l.name.trim()) return 'Name is required.';
  const data = structuredClone(state.data);
  if (data.ledgers.some((x) => x.id !== l.id && x.name.trim().toLowerCase() === l.name.trim().toLowerCase())) return 'A ledger with this name already exists.';
  const i = data.ledgers.findIndex((x) => x.id === l.id);
  if (i >= 0) data.ledgers[i] = l; else data.ledgers.push(l);
  commit(data);
  return null;
}

export function saveItem(it: Item): string | null {
  if (!it.name.trim()) return 'Name is required.';
  const data = structuredClone(state.data);
  if (data.items.some((x) => x.id !== it.id && x.name.trim().toLowerCase() === it.name.trim().toLowerCase())) return 'An item with this name already exists.';
  const i = data.items.findIndex((x) => x.id === it.id);
  if (i >= 0) data.items[i] = it; else data.items.push(it);
  commit(data);
  return null;
}

export const newLedgerId = () => uid('L');
export const newItemId = () => uid('I');

export function resetDemo() {
  commit(seed());
  set({ nav: [{ name: 'dashboard' }] });
  toast('Demo company restored');
}
