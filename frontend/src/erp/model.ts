import { useSyncExternalStore } from 'react';
import { DOCTYPE, makeNext } from '../api/erpnext';
import { Frappe, sameSite } from '../api/frappe';
import { DocType, DOC_META } from '../domain/types';
import { todayISO } from '../format';

/** Item documents Fluid handles natively on ERPNext. Payments come from bills; journals open in ERPNext. */
export const ITEM_TYPES = ['PO', 'GRN', 'PBILL', 'SO', 'DN', 'SINV'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const isPurchase = (t: DocType) => DOC_META[t].side === 'purchase';
export const partyField = (t: DocType) => (isPurchase(t) ? 'supplier' : 'customer');
export const dateField = (t: DocType) => (t === 'PO' || t === 'SO' ? 'transaction_date' : 'posting_date');
export const typeOfDoctype = (dt: string, paymentType?: string): DocType | undefined => {
  if (dt === 'Payment Entry') return paymentType === 'Receive' ? 'RCPT' : 'PAY';
  return (Object.keys(DOCTYPE) as DocType[]).find((t) => DOCTYPE[t] === dt && t !== 'CONTRA' && t !== 'RCPT');
};
export const deskUrl = (doctype: string, name?: string) => `/app/${doctype.toLowerCase().replace(/ /g, '-')}${name ? '/' + encodeURIComponent(name) : '/new'}`;
export const reportUrl = (report: string) => `/app/query-report/${encodeURIComponent(report)}`;

export interface Boot { user: string; default_company?: string; currency?: string }
export interface Masters {
  company: string;
  suppliers: { name: string; supplier_name: string }[];
  customers: { name: string; customer_name: string }[];
  items: { name: string; item_name: string; stock_uom: string; standard_rate?: number; valuation_rate?: number; last_purchase_rate?: number }[];
  warehouses: { name: string }[];
  bins: Map<string, { actual: number; ordered: number; reserved: number }>;
  defaultWarehouse?: string;
}

export type ErpView =
  | { name: 'home' }
  | { name: 'list'; filter?: DocType }
  | { name: 'cycle'; side: 'purchase' | 'sales' }
  | { name: 'doc'; type: DocType; id: string }
  | { name: 'new'; type: DocType; draft?: Record<string, unknown> }
  | { name: 'stock' };

interface State { nav: ErpView[]; masters?: Masters; error?: string; toast?: { text: string; tone: 'good' | 'bad'; at: number }; palette: boolean; version: number }

let state: State = { nav: [{ name: 'home' }], palette: false, version: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const useErp = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
export const erpState = () => state;

export const api: Frappe = sameSite();
export const boot = (): Boot => (globalThis as { fluid_boot?: Boot }).fluid_boot ?? { user: 'Guest' };
/** True when the page is served by the fluid_erp app inside an ERPNext site. */
export const onErpSite = () => !!(globalThis as { fluid_boot?: Boot }).fluid_boot;

export const erpNav = {
  go(v: ErpView) { set({ nav: [...state.nav, v].slice(-30), palette: false }); },
  replace(v: ErpView) { set({ nav: [...state.nav.slice(0, -1), v] }); },
  back() { if (state.nav.length > 1) set({ nav: state.nav.slice(0, -1) }); },
  home(v?: ErpView) { set({ nav: v ? [{ name: 'home' }, v] : [{ name: 'home' }], palette: false }); },
};
export const setErpPalette = (palette: boolean) => set({ palette });
/** Bump after a save so lists and boards refetch. */
export const invalidate = () => set({ version: state.version + 1 });

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function erpToast(text: string, tone: 'good' | 'bad' = 'good') {
  set({ toast: { text, tone, at: Date.now() } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => set({ toast: undefined }), tone === 'bad' ? 6000 : 3200);
}

export async function loadMasters() {
  try {
    const company = boot().default_company
      ?? (await api.getList<{ name: string }>('Company', { limit: 1 }))[0]?.name ?? '';
    const [suppliers, customers, items, warehouses, bins, stockSettings] = await Promise.all([
      api.getList<Masters['suppliers'][number]>('Supplier', { fields: ['name', 'supplier_name'], filters: [['disabled', '=', 0]], limit: 2000 }),
      api.getList<Masters['customers'][number]>('Customer', { fields: ['name', 'customer_name'], filters: [['disabled', '=', 0]], limit: 2000 }),
      api.getList<Masters['items'][number]>('Item', { fields: ['name', 'item_name', 'stock_uom', 'standard_rate', 'valuation_rate', 'last_purchase_rate'], filters: [['disabled', '=', 0], ['is_stock_item', '=', 1]], limit: 5000 }),
      api.getList<{ name: string }>('Warehouse', { fields: ['name'], filters: [['is_group', '=', 0], ['company', '=', company]], limit: 500 }),
      api.getList<{ item_code: string; actual_qty: number; ordered_qty: number; reserved_qty: number }>('Bin', { fields: ['item_code', 'actual_qty', 'ordered_qty', 'reserved_qty'], limit: 20000 }),
      api.getDoc<{ default_warehouse?: string }>('Stock Settings', 'Stock Settings').catch(() => ({} as { default_warehouse?: string })),
    ]);
    const binMap = new Map<string, { actual: number; ordered: number; reserved: number }>();
    for (const b of bins) {
      const cur = binMap.get(b.item_code) ?? { actual: 0, ordered: 0, reserved: 0 };
      cur.actual += b.actual_qty; cur.ordered += b.ordered_qty; cur.reserved += b.reserved_qty;
      binMap.set(b.item_code, cur);
    }
    set({ masters: { company, suppliers, customers, items, warehouses, bins: binMap, defaultWarehouse: stockSettings.default_warehouse ?? warehouses[0]?.name }, error: undefined });
  } catch (e) {
    set({ error: (e as Error).message });
  }
}

export interface ErpLine { item_code: string; qty: number; rate: number; uom?: string; [k: string]: unknown }

/** A blank document of the given type with the fields ERPNext requires. */
export function blankDoc(type: ItemType, m: Masters): Record<string, unknown> {
  const today = todayISO();
  const doc: Record<string, unknown> = { doctype: DOCTYPE[type], company: m.company, [dateField(type)]: today, set_warehouse: m.defaultWarehouse, items: [] };
  if (type === 'PO') doc.schedule_date = today;
  if (type === 'SO') doc.delivery_date = today;
  if (type === 'PBILL' || type === 'SINV') doc.update_stock = 1; // direct bill/invoice also moves stock, like Tally
  if (type === 'GRN' || type === 'DN' || type === 'PBILL' || type === 'SINV') doc.set_posting_time = 1;
  return doc;
}

/** Fill row-level required fields before saving. */
export function finalize(type: DocType, doc: Record<string, unknown>) {
  const items = ((doc.items as ErpLine[]) ?? []).filter((l) => l.item_code);
  for (const l of items) {
    if (type === 'PO') l.schedule_date ??= doc.schedule_date;
    if (type === 'SO') l.delivery_date ??= doc.delivery_date;
    if (doc.set_warehouse && !l.warehouse) l.warehouse = doc.set_warehouse;
  }
  return { ...doc, items };
}

export async function createNext(source: DocType, name: string, target: DocType) {
  const draft = await makeNext(api, source, name, target);
  erpNav.go({ name: 'new', type: target, draft });
}

export interface DocRow { name: string; doctype: string; type: DocType; date: string; party: string; total: number; status: string; docstatus: number }

const LIST_FIELDS: Record<string, string[]> = {
  'Purchase Order': ['supplier as party', 'transaction_date as date', 'grand_total as total', 'status'],
  'Sales Order': ['customer as party', 'transaction_date as date', 'grand_total as total', 'status'],
  'Purchase Receipt': ['supplier as party', 'posting_date as date', 'grand_total as total', 'status'],
  'Delivery Note': ['customer as party', 'posting_date as date', 'grand_total as total', 'status'],
  'Purchase Invoice': ['supplier as party', 'posting_date as date', 'grand_total as total', 'status'],
  'Sales Invoice': ['customer as party', 'posting_date as date', 'grand_total as total', 'status'],
  'Payment Entry': ['party', 'posting_date as date', 'paid_amount as total', 'payment_type as status'],
};

/** Day Book: latest submitted/cancelled documents of each kind, newest first. */
export async function dayBook(filter?: DocType, limit = 40): Promise<DocRow[]> {
  const doctypes = filter ? [DOCTYPE[filter]] : Object.keys(LIST_FIELDS);
  const lists = await Promise.all([...new Set(doctypes)].map(async (dt) => {
    const rows = await api.getList<Record<string, unknown>>(dt, { fields: ['name', 'docstatus', ...LIST_FIELDS[dt]], filters: [['docstatus', '>', 0]], orderBy: 'modified desc', limit });
    return rows.map((r) => ({
      name: String(r.name), doctype: dt, type: typeOfDoctype(dt, String(r.status))!, date: String(r.date), party: String(r.party ?? ''),
      total: Number(r.total ?? 0), status: Number(r.docstatus) === 2 ? 'Cancelled' : dt === 'Payment Entry' ? 'Submitted' : String(r.status), docstatus: Number(r.docstatus),
    }));
  }));
  return lists.flat().filter((r) => !filter || r.type === filter).sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name));
}

/** Documents linked to `doc`: upstream from its item rows, downstream by searching child tables, plus payments. */
export async function linkedDocs(type: DocType, doc: Record<string, unknown>): Promise<{ doctype: string; name: string }[]> {
  const out = new Map<string, { doctype: string; name: string }>();
  const add = (doctype: string, name?: unknown) => { if (name && name !== doc.name) out.set(`${doctype}:${name}`, { doctype, name: String(name) }); };
  for (const l of (doc.items as Record<string, unknown>[]) ?? []) {
    add('Purchase Order', l.purchase_order); add('Purchase Receipt', l.purchase_receipt);
    add('Sales Order', l.sales_order ?? l.against_sales_order); add('Delivery Note', l.delivery_note);
  }
  const name = String(doc.name);
  const down = ({
    PO: [['Purchase Receipt', 'Purchase Receipt Item', 'purchase_order'], ['Purchase Invoice', 'Purchase Invoice Item', 'purchase_order']],
    GRN: [['Purchase Invoice', 'Purchase Invoice Item', 'purchase_receipt']],
    SO: [['Delivery Note', 'Delivery Note Item', 'against_sales_order'], ['Sales Invoice', 'Sales Invoice Item', 'sales_order']],
    DN: [['Sales Invoice', 'Sales Invoice Item', 'delivery_note']],
  } as Record<string, [string, string, string][]>)[type] ?? [];
  await Promise.all([
    ...down.map(async ([dt, child, field]) => {
      const rows = await api.getList<{ name: string }>(dt, { fields: ['name'], filters: [[child, field, '=', name], ['docstatus', '<', 2]] }).catch(() => []);
      rows.forEach((r) => add(dt, r.name));
    }),
    (type === 'PBILL' || type === 'SINV') && api.getList<{ name: string }>('Payment Entry', {
      fields: ['name'], filters: [['Payment Entry Reference', 'reference_name', '=', name], ['docstatus', '=', 1]],
    }).then((rows) => rows.forEach((r) => add('Payment Entry', r.name))).catch(() => undefined),
  ]);
  return [...out.values()];
}
