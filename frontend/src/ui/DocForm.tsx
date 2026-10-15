import { useEffect, useMemo, useRef, useState } from 'react';
import { chainOf, docItemsTotal, docStatus, Engine, lineAmount, pendingLines, round2 } from '../domain/engine';
import { CASH_GROUPS, PARTY_GROUPS } from '../domain/seed';
import { Allocation, Data, Doc, DocType, DOC_META, EntryLine, ItemLine } from '../domain/types';
import { addDays, fmtDate, money, qty, todayISO } from '../format';
import { cancelDoc, getState, nav, newItemId, newLedgerId, saveDoc, saveItem, saveLedger, toast, useStore, View } from '../store';
import { DateInput, focusNext, Kbd, Modal, NumInput, PageHead, Picker, Pill, TextInput } from './common';
import { itemOptions, ledgerOptions, underGroups } from './options';

type DocView = Extract<View, { name: 'doc' }>;

let lastDate = '';

function blank(type: DocType, prefill?: Partial<Doc>): Doc {
  return {
    id: '', type, number: 'New', date: lastDate || todayISO(), lines: [], narration: '', status: 'posted', audit: [],
    entries: type === 'JRNL' || type === 'CONTRA' ? [] : undefined,
    allocations: type === 'PAY' || type === 'RCPT' ? [] : undefined,
    ...structuredClone(prefill ?? {}),
  };
}

/** Lines to pull into `target`: from GRN/DN first; from the order directly only when nothing was received/delivered. */
export function suggestLines(data: Data, eng: Engine, target: DocType, partyId?: string, onlyIds?: Set<string>): ItemLine[] {
  let p = pendingLines(data, eng, target, partyId, onlyIds);
  const moved = p.filter((x) => x.doc.type === 'GRN' || x.doc.type === 'DN');
  if (moved.length) p = moved;
  return p.map((x) => ({ itemId: x.itemId, qty: x.remaining, rate: x.rate, src: x.src }));
}

const NEXT: Partial<Record<DocType, { key: string; label: string; target: DocType }[]>> = {
  PO: [{ key: 'r', label: 'Receive goods', target: 'GRN' }, { key: 'b', label: 'Enter bill', target: 'PBILL' }],
  GRN: [{ key: 'b', label: 'Enter bill', target: 'PBILL' }],
  SO: [{ key: 'd', label: 'Deliver', target: 'DN' }, { key: 'i', label: 'Invoice', target: 'SINV' }],
  DN: [{ key: 'i', label: 'Invoice', target: 'SINV' }],
  PBILL: [{ key: 'p', label: 'Make payment', target: 'PAY' }],
  SINV: [{ key: 'p', label: 'Record receipt', target: 'RCPT' }],
};

export function DocScreen({ view }: { view: DocView }) {
  const [formKey, setFormKey] = useState(0);
  return <DocForm key={`${view.id ?? 'new'}-${view.type}-${view.edit}-${formKey}`} view={view} onSavedNew={() => setFormKey((k) => k + 1)} />;
}

function DocForm({ view, onSavedNew }: { view: DocView; onSavedNew: () => void }) {
  const { data, eng } = useStore();
  const existing = view.id ? data.docs.find((d) => d.id === view.id) : undefined;
  const readOnly = !!existing && (!view.edit || existing.status === 'cancelled');
  const [draft, setDraft] = useState<Doc>(() => (existing ? structuredClone(existing) : blank(view.type, view.prefill)));
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const meta = DOC_META[draft.type];
  const today = todayISO();
  const formRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<Doc>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };

  const save = () => {
    const clean: Doc = {
      ...draft,
      lines: draft.lines.filter((l) => l.itemId),
      entries: draft.entries?.filter((e) => e.ledgerId && (e.dr || e.cr)),
      allocations: draft.allocations?.filter((a) => a.amount > 0),
    };
    const res = saveDoc(clean);
    if (res.errors.length) { setErrors(res.errors); return; }
    lastDate = clean.date;
    toast(`${meta.label} ${res.doc!.number} saved`);
    if (existing) nav.replace({ name: 'doc', id: existing.id, type: existing.type });
    else if (view.prefill) nav.replace({ name: 'doc', id: res.doc!.id, type: res.doc!.type });
    else onSavedNew(); // Tally-style: stay on a fresh voucher of the same type
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.isDefaultPrevented()) return;
    if (e.key === 'Escape' && dirty && !readOnly) { e.preventDefault(); setConfirmQuit(true); }
  };

  // Save from anywhere on the screen: Ctrl+Enter, Ctrl+S, or Tally's Ctrl+A.
  useEffect(() => {
    if (readOnly) return;
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !['enter', 'a', 's'].includes(e.key.toLowerCase()) || document.querySelector('.modal, .palette')) return;
      e.preventDefault();
      save();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  // Land the cursor where typing should start: first quantity for pulled-in lines, else the first field.
  useEffect(() => {
    const root = formRef.current;
    if (readOnly || !root || root.contains(document.activeElement)) return;
    const first = (draft.lines.length ? root.querySelector('table.lines input.num') : root.querySelector('[data-nav]')) as HTMLInputElement | null;
    first?.focus();
    first?.select?.();
  }, []); // eslint-disable-line

  // View-mode single-key actions
  const chain = existing ? chainOf(eng, existing.id) : [];
  const actions = existing && existing.status === 'posted' ? (NEXT[existing.type] ?? []).filter((a) => hasPending(data, eng, existing, a.target)) : [];
  const runAction = (target: DocType) => {
    if (!existing) return;
    const ids = new Set(chain.map((d) => d.id));
    if (target === 'PAY' || target === 'RCPT') {
      const due = eng.outstanding.get(existing.id)?.due ?? 0;
      nav.go({ name: 'doc', type: target, prefill: { partyId: existing.partyId, amount: due, allocations: [{ docId: existing.id, amount: due }], accountId: 'L_HDFC' } });
    } else {
      const prefill: Partial<Doc> = { partyId: existing.partyId, lines: suggestLines(data, eng, target, existing.partyId, ids) };
      if (target === 'PBILL' || target === 'SINV') prefill.dueDate = addDays(lastDate || today, creditDays(data, existing.partyId));
      nav.go({ name: 'doc', type: target, prefill });
    }
  };
  useEffect(() => {
    if (!readOnly || !existing) return;
    const h = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || getState().palette || cancelling) return;
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      const k = e.key.toLowerCase();
      const a = actions.find((x) => x.key === k);
      if (a) { e.preventDefault(); runAction(a.target); }
      else if (k === 'e' && existing.status === 'posted') { e.preventDefault(); nav.replace({ ...view, edit: true }); }
      else if (k === 'x' && existing.status === 'posted') { e.preventDefault(); setCancelling(true); }
      else if (/^[1-9]$/.test(k) && chain[Number(k) - 1] && chain[Number(k) - 1].id !== existing.id) {
        const d = chain[Number(k) - 1];
        e.preventDefault();
        nav.go({ name: 'doc', id: d.id, type: d.type });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const status = existing ? docStatus(existing, eng, today) : undefined;
  const total = meta.items ? docItemsTotal(draft) : draft.type === 'PAY' || draft.type === 'RCPT' ? draft.amount ?? 0 : round2((draft.entries ?? []).reduce((s, e) => s + e.dr, 0));

  return (
    <div className={`docform ${readOnly ? 'ro' : ''}`} data-form ref={formRef} onKeyDown={onKeyDown}>
      <PageHead
        title={<>{meta.label} <span className="docno">{existing ? existing.number : 'New'}</span> {status && <Pill tone={status.tone}>{status.label}</Pill>}</>}
        sub={readOnly ? `${fmtDate(draft.date)} · ${meta.key}` : <>Enter moves to the next field · <Kbd>Ctrl+Enter</Kbd> saves · <Kbd>Esc</Kbd> goes back</>}
      >
        {readOnly && existing?.status === 'posted' && (
          <>
            {actions.map((a) => <button key={a.key} className="primary" onClick={() => runAction(a.target)}><Kbd>{a.key.toUpperCase()}</Kbd> {a.label}</button>)}
            <button onClick={() => nav.replace({ ...view, edit: true })}><Kbd>E</Kbd> Edit</button>
            <button className="danger" onClick={() => setCancelling(true)}><Kbd>X</Kbd> Cancel</button>
          </>
        )}
        {!readOnly && <button className="primary" onClick={save}>Save <Kbd>Ctrl+Enter</Kbd></button>}
      </PageHead>

      {errors.length > 0 && <div className="errors">{errors.map((e) => <div key={e}>{e}</div>)}</div>}

      <div className="doc-layout">
        <div className="doc-main card">
          {meta.items && <ItemDocBody draft={draft} update={update} readOnly={readOnly} />}
          {(draft.type === 'PAY' || draft.type === 'RCPT') && <PaymentBody draft={draft} update={update} readOnly={readOnly} original={existing} />}
          {(draft.type === 'JRNL' || draft.type === 'CONTRA') && <JournalBody draft={draft} update={update} readOnly={readOnly} />}
          <div className="doc-foot">
            <label className="field grow">
              <span>Narration</span>
              <TextInput multiline value={draft.narration} onChange={(narration) => update({ narration })} disabled={readOnly} />
            </label>
            <div className="doc-total"><span>Total</span><strong>₹ {money(total)}</strong></div>
          </div>
          {!readOnly && <div className="save-row"><button className="primary" data-nav data-save onClick={save} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}>Accept and save</button><span className="muted">or press <Kbd>Ctrl+Enter</Kbd> from any field</span></div>}
        </div>

        {existing && (
          <aside className="doc-side">
            {chain.length > 1 && (
              <div className="card">
                <h4>Document flow</h4>
                <ol className="chain">
                  {chain.map((d, i) => {
                    const st = docStatus(d, eng, today);
                    return (
                      <li key={d.id} className={d.id === existing.id ? 'cur' : ''} onClick={() => d.id !== existing.id && nav.go({ name: 'doc', id: d.id, type: d.type })}>
                        <Kbd>{i + 1}</Kbd>
                        <div>
                          <div><strong>{d.number}</strong> <span className="muted">{DOC_META[d.type].label}</span></div>
                          <div className="muted small">{fmtDate(d.date)} · ₹ {money(eng.docValue.get(d.id) ?? 0)}</div>
                        </div>
                        <Pill tone={st.tone}>{st.label}</Pill>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            {existing.type !== 'JRNL' && existing.type !== 'CONTRA' && <Postings doc={existing} />}
            <div className="card">
              <h4>Audit trail</h4>
              <ul className="audit">
                {existing.audit.map((a, i) => (
                  <li key={i}><span className={`dot ${a.action}`} />{a.action[0].toUpperCase() + a.action.slice(1)} <span className="muted">{new Date(a.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>{a.note && <div className="small">“{a.note}”</div>}</li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>

      {confirmQuit && (
        <Modal title="Discard this entry?" onClose={() => setConfirmQuit(false)}>
          <p>Your changes have not been saved.</p>
          <div className="modal-actions">
            <button autoFocus className="danger" onClick={() => nav.back()} onKeyDown={(e) => { if (e.key.toLowerCase() === 'y') nav.back(); if (e.key.toLowerCase() === 'n') setConfirmQuit(false); }}><Kbd>Y</Kbd> Discard</button>
            <button onClick={() => setConfirmQuit(false)}><Kbd>N</Kbd> Keep editing</button>
          </div>
        </Modal>
      )}
      {cancelling && existing && <CancelModal doc={existing} onClose={() => setCancelling(false)} />}
    </div>
  );
}

function CancelModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const go = () => {
    if (!reason.trim()) { setErr('Please give a reason; it is kept in the audit trail.'); return; }
    const e = cancelDoc(doc.id, reason.trim());
    if (e) setErr(e); else { toast(`${doc.number} cancelled`); onClose(); }
  };
  return (
    <Modal title={`Cancel ${doc.number}?`} onClose={onClose}>
      <p className="muted">Cancelled documents stay in the books, marked cancelled, with no effect on balances or stock.</p>
      <input autoFocus placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
      {err && <div className="errors">{err}</div>}
      <div className="modal-actions"><button className="danger" onClick={go}>Cancel document</button><button onClick={onClose}>Keep</button></div>
    </Modal>
  );
}

function Postings({ doc }: { doc: Doc }) {
  const { data, eng } = useStore();
  if (doc.status !== 'posted') return null;
  // One row per ledger, Dr first, like a voucher's accounting view.
  const byLedger = new Map<string, number>();
  for (const p of eng.postings) if (p.docId === doc.id) byLedger.set(p.ledgerId, round2((byLedger.get(p.ledgerId) ?? 0) + p.amount));
  const ps = [...byLedger].map(([ledgerId, amount]) => ({ ledgerId, amount })).filter((p) => Math.abs(p.amount) > 0.004).sort((a, b) => b.amount - a.amount);
  const ms = eng.moves.filter((m) => m.docId === doc.id);
  if (!ps.length && !ms.length) return <div className="card"><h4>Accounting effect</h4><p className="muted small">Orders do not touch the books. They track what is still to be received or delivered.</p></div>;
  const ln = (id: string) => data.ledgers.find((l) => l.id === id)?.name;
  return (
    <div className="card">
      <h4>Accounting effect</h4>
      <table className="mini">
        <thead><tr><th /><th className="num">Dr</th><th className="num">Cr</th></tr></thead>
        <tbody>
          {ps.map((p, i) => <tr key={i} onClick={() => nav.go({ name: 'ledger', id: p.ledgerId })}><td>{ln(p.ledgerId)}</td><td className="num">{p.amount > 0 ? money(p.amount) : ''}</td><td className="num">{p.amount < 0 ? money(-p.amount) : ''}</td></tr>)}
        </tbody>
      </table>
      {ms.length > 0 && (
        <>
          <h4>Stock effect</h4>
          <table className="mini">
            <tbody>
              {ms.map((m, i) => { const it = data.items.find((x) => x.id === m.itemId); return <tr key={i} onClick={() => nav.go({ name: 'item', id: m.itemId })}><td>{it?.name}</td><td className={`num ${m.qty > 0 ? 'pos' : 'neg'}`}>{m.qty > 0 ? '+' : ''}{qty(m.qty)} {it?.unit}</td><td className="num muted">₹ {money(Math.abs(m.value))}</td></tr>; })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const creditDays = (data: Data, partyId?: string) => data.ledgers.find((l) => l.id === partyId)?.creditDays ?? 0;

function hasPending(data: Data, eng: Engine, doc: Doc, target: DocType) {
  if (target === 'PAY' || target === 'RCPT') return (eng.outstanding.get(doc.id)?.due ?? 0) > 0.001;
  return suggestLines(data, eng, target, doc.partyId, new Set(chainOf(eng, doc.id).map((d) => d.id))).length > 0;
}

interface BodyProps { draft: Doc; update: (p: Partial<Doc>) => void; readOnly: boolean }

function ItemDocBody({ draft, update, readOnly }: BodyProps) {
  const { data, eng } = useStore();
  const meta = DOC_META[draft.type];
  const purchase = meta.side === 'purchase';
  const partyGroup = purchase ? 'G_CRED' : 'G_DEBT';
  const partyOpts = useMemo(() => ledgerOptions(data, eng, underGroups(data, [partyGroup])), [data, eng, partyGroup]);
  const itemOpts = useMemo(() => itemOptions(data, eng), [data, eng]);
  const hasDue = draft.type === 'PBILL' || draft.type === 'SINV';
  const pending = useMemo(
    () => (draft.partyId && !readOnly ? suggestLines(data, eng, draft.type, draft.partyId).filter((p) => !draft.lines.some((l) => l.src && l.src.docId === p.src!.docId && l.src.line === p.src!.line)) : []),
    [data, eng, draft.partyId, draft.type, draft.lines, readOnly],
  );
  const party = data.ledgers.find((l) => l.id === draft.partyId);
  const narrationFocus = () => (document.querySelector('[data-form] textarea') as HTMLElement | null)?.focus();

  const setLine = (i: number, patch: Partial<ItemLine>) => update({ lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const addLine = (itemId: string) => {
    const it = data.items.find((x) => x.id === itemId)!;
    update({ lines: [...draft.lines, { itemId, qty: 0, rate: purchase ? it.purchaseRate : it.salesRate }] });
  };
  const removeLine = (i: number) => update({ lines: draft.lines.filter((_, j) => j !== i) });
  const pull = () => { if (pending.length) update({ lines: [...draft.lines.filter((l) => l.itemId), ...pending] }); };

  const createParty = (name: string) => {
    const id = newLedgerId();
    const err = saveLedger({ id, name, groupId: partyGroup, opening: 0, creditDays: 30 });
    if (err) { toast(err, 'bad'); return undefined; }
    toast(`Ledger “${name}” created under ${purchase ? 'Sundry Creditors' : 'Sundry Debtors'}`);
    return id;
  };
  const createItem = (name: string) => {
    const id = newItemId();
    const err = saveItem({ id, name, sku: '', unit: 'Pcs', salesRate: 0, purchaseRate: 0, reorderLevel: 0, openingQty: 0, openingRate: 0 });
    if (err) { toast(err, 'bad'); return undefined; }
    toast(`Item “${name}” created; set its rates later in Stock Items`);
    return id;
  };

  const rows = readOnly ? draft.lines : [...draft.lines, null];
  const srcDoc = (l: ItemLine) => (l.src ? eng.byId.get(l.src.docId) : undefined);

  return (
    <div onKeyDown={(e) => { if (e.altKey && e.key.toLowerCase() === 'l') { e.preventDefault(); pull(); } }}>
      <div className="fields">
        <label className="field w-date"><span>Date</span><DateInput value={draft.date} onChange={(date) => update({ date, dueDate: hasDue ? addDays(date, creditDays(data, draft.partyId)) : draft.dueDate })} disabled={readOnly} /></label>
        <label className="field grow">
          <span>{purchase ? 'Supplier' : 'Customer'}</span>
          <Picker autoFocus={!readOnly && !draft.partyId} disabled={readOnly} value={draft.partyId} options={partyOpts} placeholder="Type to search, Alt+C to create" onCreate={createParty} createLabel="Create ledger"
            onChange={(partyId) => update({ partyId, dueDate: hasDue ? addDays(draft.date, creditDays(data, partyId)) : undefined, lines: draft.lines.filter((l) => !l.src) })} />
        </label>
        {hasDue && <label className="field w-date"><span>Due date</span><DateInput value={draft.dueDate ?? draft.date} onChange={(dueDate) => update({ dueDate })} disabled={readOnly} /></label>}
      </div>
      {party && !readOnly && (
        <div className="party-info">
          <span>Balance <strong>{balanceText(data, eng, party.id)}</strong></span>
          {party.creditDays ? <span>Credit {party.creditDays} days</span> : null}
          {pending.length > 0 && (
            <button className="pending" onClick={pull}>
              {pending.length} pending line{pending.length > 1 ? 's' : ''} from {[...new Set(pending.map((p) => eng.byId.get(p.src!.docId)?.number))].join(', ')} <Kbd>Alt+L</Kbd> pull in
            </button>
          )}
        </div>
      )}
      <table className="grid lines">
        <thead><tr><th className="c-no">#</th><th>Item</th><th className="num w-qty">Qty</th><th className="w-unit">Unit</th><th className="num w-rate">Rate</th><th className="num w-amt">Amount</th><th className="w-src">Against</th>{!readOnly && <th className="w-x" />}</tr></thead>
        <tbody>
          {rows.map((l, i) => {
            const it = l ? data.items.find((x) => x.id === l.itemId) : undefined;
            const s = l ? srcDoc(l) : undefined;
            return (
              <tr key={i} onKeyDown={(e) => { if (l && (e.altKey && e.key.toLowerCase() === 'd' || (e.ctrlKey && e.key === 'Delete'))) { e.preventDefault(); removeLine(i); } }}>
                <td className="c-no muted">{l ? i + 1 : ''}</td>
                <td>
                  <Picker disabled={readOnly} value={l?.itemId} options={itemOpts} placeholder={draft.lines.length ? 'Next item, or Enter to finish' : 'Type an item name'} onCreate={createItem} createLabel="Create item"
                    onChange={(itemId) => (l ? setLine(i, { itemId }) : addLine(itemId))}
                    onEmptyEnter={l ? undefined : () => narrationFocus()} />
                </td>
                <td>{l && <NumInput disabled={readOnly} value={l.qty} onChange={(q) => setLine(i, { qty: q })} />}</td>
                <td className="muted">{it?.unit}</td>
                <td>{l && <NumInput disabled={readOnly} value={l.rate} onChange={(rate) => setLine(i, { rate })} />}</td>
                <td className="num">{l ? money(lineAmount(l)) : ''}</td>
                <td className="muted small">{s?.number}</td>
                {!readOnly && <td>{l && <button className="icon" tabIndex={-1} title="Remove line (Alt+D)" onClick={() => removeLine(i)}>×</button>}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!readOnly && <div className="hint-row muted small">Alt+D removes a line · Enter on an empty item finishes · Alt+C creates a missing item</div>}
    </div>
  );
}

function balanceText(data: Data, eng: Engine, ledgerId: string) {
  const l = data.ledgers.find((x) => x.id === ledgerId);
  let b = l?.opening ?? 0;
  for (const p of eng.postings) if (p.ledgerId === ledgerId) b += p.amount;
  return Math.abs(b) < 0.005 ? 'Nil' : `₹ ${money(Math.abs(b))} ${b > 0 ? 'Dr' : 'Cr'}`;
}

function PaymentBody({ draft, update, readOnly, original }: BodyProps & { original?: Doc }) {
  const { data, eng } = useStore();
  const isPay = draft.type === 'PAY';
  const isCash = underGroups(data, CASH_GROUPS);
  const partyOpts = useMemo(() => ledgerOptions(data, eng, (l) => !isCash(l) && !l.system), [data, eng]); // eslint-disable-line
  const acctOpts = useMemo(() => ledgerOptions(data, eng, isCash), [data, eng]); // eslint-disable-line
  const [manual, setManual] = useState(!!original);
  const billType = isPay ? 'PBILL' : 'SINV';
  const bills = useMemo(() => {
    if (!draft.partyId) return [];
    return data.docs
      .filter((d) => d.type === billType && d.status === 'posted' && d.partyId === draft.partyId)
      .map((d) => {
        const own = original?.status === 'posted' ? (original.allocations ?? []).find((a) => a.docId === d.id)?.amount ?? 0 : 0;
        return { doc: d, due: round2((eng.outstanding.get(d.id)?.due ?? 0) + own) };
      })
      .filter((b) => b.due > 0.001 || (draft.allocations ?? []).some((a) => a.docId === b.doc.id))
      .sort((a, b) => a.doc.date.localeCompare(b.doc.date));
  }, [data, eng, draft.partyId, billType, original, draft.allocations]);

  const fifo = (amount: number): Allocation[] => {
    let left = amount;
    const out: Allocation[] = [];
    for (const b of bills) {
      if (left <= 0) break;
      const a = round2(Math.min(left, b.due));
      out.push({ docId: b.doc.id, amount: a });
      left = round2(left - a);
    }
    return out;
  };
  const allocOf = (id: string) => (draft.allocations ?? []).find((a) => a.docId === id)?.amount ?? 0;
  const setAlloc = (id: string, amount: number) => {
    setManual(true);
    const rest = (draft.allocations ?? []).filter((a) => a.docId !== id);
    update({ allocations: amount > 0 ? [...rest, { docId: id, amount }] : rest });
  };
  const allocated = round2((draft.allocations ?? []).reduce((s, a) => s + a.amount, 0));
  const party = data.ledgers.find((l) => l.id === draft.partyId);
  useEffect(() => { if (!draft.accountId && !readOnly) update({ accountId: acctOpts.find((o) => o.id === 'L_HDFC')?.id ?? acctOpts[0]?.id }); }, []); // eslint-disable-line

  return (
    <div onKeyDown={(e) => { if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); setManual(false); update({ allocations: fifo(draft.amount ?? 0) }); } }}>
      <div className="fields">
        <label className="field w-date"><span>Date</span><DateInput value={draft.date} onChange={(date) => update({ date })} disabled={readOnly} /></label>
        <label className="field grow">
          <span>{isPay ? 'Paid to' : 'Received from'}</span>
          <Picker autoFocus={!readOnly && !draft.partyId} disabled={readOnly} value={draft.partyId} options={partyOpts} placeholder="Party or expense ledger"
            onChange={(partyId) => { setManual(false); update({ partyId, allocations: [] }); }} />
        </label>
      </div>
      <div className="fields">
        <label className="field grow"><span>{isPay ? 'Paid from' : 'Deposited into'}</span><Picker disabled={readOnly} value={draft.accountId} options={acctOpts} onChange={(accountId) => update({ accountId })} /></label>
        <label className="field w-amt"><span>Amount</span><NumInput disabled={readOnly} value={draft.amount ?? 0} onChange={(amount) => update({ amount, allocations: manual ? draft.allocations : fifo(amount) })} /></label>
      </div>
      {party && !readOnly && <div className="party-info"><span>Balance <strong>{balanceText(data, eng, party.id)}</strong></span></div>}
      {bills.length > 0 && (
        <>
          <h4 className="section">Settle against bills <span className="muted small">oldest first by default · <Kbd>Alt+A</Kbd> re-allocates</span></h4>
          <table className="grid">
            <thead><tr><th>Bill</th><th>Date</th><th>Due</th><th className="num">Pending</th><th className="num w-amt">This {isPay ? 'payment' : 'receipt'}</th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.doc.id}>
                  <td><a onClick={() => nav.go({ name: 'doc', id: b.doc.id, type: b.doc.type })}>{b.doc.number}</a></td>
                  <td>{fmtDate(b.doc.date)}</td>
                  <td className={b.doc.dueDate && b.doc.dueDate < todayISO() ? 'neg' : ''}>{fmtDate(b.doc.dueDate)}</td>
                  <td className="num">{money(b.due)}</td>
                  <td><NumInput disabled={readOnly} value={allocOf(b.doc.id)} onChange={(n) => setAlloc(b.doc.id, n)} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4} className="num muted">{(draft.amount ?? 0) - allocated > 0.001 ? `On account (advance): ₹ ${money((draft.amount ?? 0) - allocated)}` : 'Allocated'}</td><td className="num"><strong>{money(allocated)}</strong></td></tr></tfoot>
          </table>
        </>
      )}
    </div>
  );
}

function JournalBody({ draft, update, readOnly }: BodyProps) {
  const { data, eng } = useStore();
  const contra = draft.type === 'CONTRA';
  const opts = useMemo(() => ledgerOptions(data, eng, contra ? underGroups(data, CASH_GROUPS) : (l) => l.id !== 'L_STOCK'), [data, eng, contra]);
  const entries = draft.entries ?? [];
  const dr = round2(entries.reduce((s, e) => s + e.dr, 0));
  const cr = round2(entries.reduce((s, e) => s + e.cr, 0));
  const diff = round2(dr - cr);
  const setEntry = (i: number, patch: Partial<EntryLine>) => update({ entries: entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  // New line gets the balancing amount on the opposite side, like Tally.
  const addEntry = (ledgerId: string) => update({ entries: [...entries, { ledgerId, dr: diff < 0 ? -diff : 0, cr: diff > 0 ? diff : 0 }] });
  const rows: (EntryLine | null)[] = readOnly ? entries : [...entries, null];
  const narrationFocus = () => (document.querySelector('[data-form] textarea') as HTMLElement | null)?.focus();
  return (
    <div>
      <div className="fields"><label className="field w-date"><span>Date</span><DateInput autoFocus={!readOnly} value={draft.date} onChange={(date) => update({ date })} disabled={readOnly} /></label></div>
      <table className="grid lines">
        <thead><tr><th className="c-no">#</th><th>{contra ? 'Cash / bank account' : 'Ledger'}</th><th className="num w-amt">Debit</th><th className="num w-amt">Credit</th>{!readOnly && <th className="w-x" />}</tr></thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i} onKeyDown={(ev) => { if (e && ev.altKey && ev.key.toLowerCase() === 'd') { ev.preventDefault(); update({ entries: entries.filter((_, j) => j !== i) }); } }}>
              <td className="c-no muted">{e ? i + 1 : ''}</td>
              <td><Picker disabled={readOnly} value={e?.ledgerId} options={opts} placeholder={entries.length >= 2 && !diff ? 'Enter to finish' : 'Ledger'} onChange={(id) => (e ? setEntry(i, { ledgerId: id }) : addEntry(id))} onEmptyEnter={e ? undefined : () => narrationFocus()} /></td>
              <td>{e && <NumInput disabled={readOnly} value={e.dr} onChange={(n) => setEntry(i, { dr: n, cr: n ? 0 : e.cr })} />}</td>
              <td>{e && <NumInput disabled={readOnly} value={e.cr} onChange={(n) => setEntry(i, { cr: n, dr: n ? 0 : e.dr })} onEnter={(el) => { focusNext(el, 1); return true; }} />}</td>
              {!readOnly && <td>{e && <button className="icon" tabIndex={-1} onClick={() => update({ entries: entries.filter((_, j) => j !== i) })}>×</button>}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td /><td className={diff ? 'neg' : 'muted'}>{diff ? `Difference ₹ ${money(Math.abs(diff))} ${diff > 0 ? 'Dr' : 'Cr'}` : 'Balanced'}</td><td className="num"><strong>{money(dr)}</strong></td><td className="num"><strong>{money(cr)}</strong></td>{!readOnly && <td />}</tr></tfoot>
      </table>
    </div>
  );
}
