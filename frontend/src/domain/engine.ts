import { Data, Doc, DocType, ItemLine, LineRef, SYS } from './types';

/** One leg of a journal entry. amount: Dr positive, Cr negative. */
export interface Posting { docId: string; date: string; ledgerId: string; amount: number }
/** Stock movement. qty positive = inward. value is at cost. */
export interface StockMove { docId: string; date: string; itemId: string; qty: number; value: number }

export interface LineProgress {
  /** PO/SO line: qty received or delivered. */
  moved: number;
  /** PO/SO/GRN/DN line: qty billed or invoiced. */
  billed: number;
}

export interface Outstanding { total: number; settled: number; due: number }

export interface Engine {
  postings: Posting[];
  moves: StockMove[];
  progress: Map<string, LineProgress>;
  outstanding: Map<string, Outstanding>;
  /** Payments/receipts: amount not allocated to any bill (on account). */
  unallocated: Map<string, number>;
  docValue: Map<string, number>;
  links: Map<string, Set<string>>; // undirected doc graph
  byId: Map<string, Doc>;
  /** Ledgers under Sundry Debtors / Creditors (bill-wise parties). */
  parties: Set<string>;
}

export const lineKey = (r: LineRef) => `${r.docId}:${r.line}`;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const lineAmount = (l: ItemLine) => round2(l.qty * l.rate);
export const docItemsTotal = (d: Doc) => round2(d.lines.reduce((s, l) => s + lineAmount(l), 0));

/** Order in which document types are applied on the same date. */
const TYPE_ORDER: Record<DocType, number> = { PO: 0, SO: 0, GRN: 1, DN: 1, PBILL: 2, SINV: 2, JRNL: 3, CONTRA: 3, PAY: 4, RCPT: 4 };

export function compute(data: Data): Engine {
  const byId = new Map(data.docs.map((d) => [d.id, d]));
  const posted = data.docs
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d.status === 'posted')
    .sort((a, b) => a.d.date.localeCompare(b.d.date) || TYPE_ORDER[a.d.type] - TYPE_ORDER[b.d.type] || a.i - b.i)
    .map((x) => x.d);

  const postings: Posting[] = [];
  const moves: StockMove[] = [];
  const progress = new Map<string, LineProgress>();
  const outstanding = new Map<string, Outstanding>();
  const unallocated = new Map<string, number>();
  const docValue = new Map<string, number>();
  const links = new Map<string, Set<string>>();
  const itemById = new Map(data.items.map((i) => [i.id, i]));

  const stock = new Map<string, { qty: number; value: number }>();
  for (const it of data.items) stock.set(it.id, { qty: it.openingQty, value: round2(it.openingQty * it.openingRate) });

  const prog = (r: LineRef) => {
    const k = lineKey(r);
    let p = progress.get(k);
    if (!p) progress.set(k, (p = { moved: 0, billed: 0 }));
    return p;
  };
  const link = (a: string, b: string) => {
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  };
  const post = (d: Doc, ledgerId: string, amount: number) => {
    if (Math.abs(amount) > 0.001) postings.push({ docId: d.id, date: d.date, ledgerId, amount: round2(amount) });
  };
  const stockIn = (d: Doc, itemId: string, qty: number, value: number) => {
    const s = stock.get(itemId) ?? { qty: 0, value: 0 };
    s.qty += qty;
    s.value = round2(s.value + value);
    stock.set(itemId, s);
    moves.push({ docId: d.id, date: d.date, itemId, qty, value: round2(value) });
  };
  /** Issue stock at moving average cost; returns the cost. */
  const stockOut = (d: Doc, itemId: string, qty: number) => {
    const s = stock.get(itemId) ?? { qty: 0, value: 0 };
    const avg = s.qty > 0 ? s.value / s.qty : itemById.get(itemId)?.purchaseRate ?? 0;
    const cost = round2(avg * qty);
    s.qty -= qty;
    s.value = s.qty === 0 ? 0 : round2(s.value - cost);
    stock.set(itemId, s);
    moves.push({ docId: d.id, date: d.date, itemId, qty: -qty, value: -cost });
    return cost;
  };
  const srcType = (l: ItemLine) => (l.src ? byId.get(l.src.docId)?.type : undefined);

  for (const d of posted) {
    for (const l of d.lines) if (l.src) link(d.id, l.src.docId);
    const total = docItemsTotal(d);
    switch (d.type) {
      case 'PO':
      case 'SO':
        docValue.set(d.id, total);
        break;
      case 'GRN': {
        for (const l of d.lines) {
          const v = lineAmount(l);
          stockIn(d, l.itemId, l.qty, v);
          post(d, SYS.stock, v);
          post(d, SYS.grni, -v);
          if (l.src) prog(l.src).moved += l.qty;
        }
        docValue.set(d.id, total);
        break;
      }
      case 'PBILL': {
        for (const l of d.lines) {
          const v = lineAmount(l);
          if (l.src && srcType(l) === 'GRN') {
            const g = byId.get(l.src.docId)!.lines[l.src.line];
            const accrued = round2(g.rate * l.qty);
            post(d, SYS.grni, accrued);
            post(d, SYS.ppv, v - accrued);
            prog(l.src).billed += l.qty;
            if (g.src) prog(g.src).billed += l.qty;
          } else {
            stockIn(d, l.itemId, l.qty, v);
            post(d, SYS.stock, v);
            if (l.src) {
              prog(l.src).moved += l.qty;
              prog(l.src).billed += l.qty;
            }
          }
        }
        post(d, d.partyId!, -total);
        outstanding.set(d.id, { total, settled: 0, due: total });
        docValue.set(d.id, total);
        break;
      }
      case 'DN': {
        let cost = 0;
        for (const l of d.lines) {
          cost += stockOut(d, l.itemId, l.qty);
          if (l.src) prog(l.src).moved += l.qty;
        }
        post(d, SYS.cogs, cost);
        post(d, SYS.stock, -cost);
        docValue.set(d.id, total);
        break;
      }
      case 'SINV': {
        let cost = 0;
        for (const l of d.lines) {
          if (l.src && srcType(l) === 'DN') {
            prog(l.src).billed += l.qty;
            const dl = byId.get(l.src.docId)!.lines[l.src.line];
            if (dl.src) prog(dl.src).billed += l.qty;
          } else {
            cost += stockOut(d, l.itemId, l.qty);
            if (l.src) {
              prog(l.src).moved += l.qty;
              prog(l.src).billed += l.qty;
            }
          }
        }
        if (cost) {
          post(d, SYS.cogs, cost);
          post(d, SYS.stock, -cost);
        }
        post(d, d.partyId!, total);
        post(d, SYS.sales, -total);
        outstanding.set(d.id, { total, settled: 0, due: total });
        docValue.set(d.id, total);
        break;
      }
      case 'PAY':
      case 'RCPT': {
        const amt = d.amount ?? 0;
        const sign = d.type === 'PAY' ? 1 : -1;
        post(d, d.partyId!, sign * amt);
        post(d, d.accountId!, -sign * amt);
        let alloc = 0;
        for (const a of d.allocations ?? []) {
          const o = outstanding.get(a.docId);
          if (o) {
            o.settled = round2(o.settled + a.amount);
            o.due = round2(o.total - o.settled);
          }
          alloc += a.amount;
          link(d.id, a.docId);
        }
        unallocated.set(d.id, round2(amt - alloc));
        docValue.set(d.id, amt);
        break;
      }
      case 'JRNL':
      case 'CONTRA': {
        let dr = 0;
        for (const e of d.entries ?? []) {
          post(d, e.ledgerId, e.dr - e.cr);
          dr += e.dr;
        }
        docValue.set(d.id, round2(dr));
        break;
      }
    }
  }
  const parties = new Set(data.ledgers.filter((l) => {
    for (let g = data.groups.find((x) => x.id === l.groupId); g; g = data.groups.find((x) => x.id === g!.parentId)) if (g.id === 'G_DEBT' || g.id === 'G_CRED') return true;
    return false;
  }).map((l) => l.id));
  return { postings, moves, progress, outstanding, unallocated, docValue, links, byId, parties };
}

/** Lines that can still be pulled into a document of type `target`. */
export interface PendingLine { src: LineRef; doc: Doc; itemId: string; remaining: number; rate: number }

const SOURCES: Partial<Record<DocType, DocType[]>> = {
  GRN: ['PO'],
  PBILL: ['GRN', 'PO'],
  DN: ['SO'],
  SINV: ['DN', 'SO'],
};

export function sourceTypes(target: DocType): DocType[] {
  return SOURCES[target] ?? [];
}

export function pendingLines(data: Data, eng: Engine, target: DocType, partyId?: string, onlyDocIds?: Set<string>): PendingLine[] {
  const types = sourceTypes(target);
  const out: PendingLine[] = [];
  for (const d of data.docs) {
    if (d.status !== 'posted' || !types.includes(d.type)) continue;
    if (partyId && d.partyId !== partyId) continue;
    if (onlyDocIds && !onlyDocIds.has(d.id)) continue;
    d.lines.forEach((l, i) => {
      const p = eng.progress.get(lineKey({ docId: d.id, line: i })) ?? { moved: 0, billed: 0 };
      // From an order, only what has not been moved yet; from a GRN/DN, what has not been billed.
      const done = d.type === 'PO' || d.type === 'SO' ? p.moved : p.billed;
      const remaining = round2(l.qty - done);
      if (remaining > 0) out.push({ src: { docId: d.id, line: i }, doc: d, itemId: l.itemId, remaining, rate: l.rate });
    });
  }
  return out;
}

/** All documents connected to `docId` through line links and allocations. */
export function chainOf(eng: Engine, docId: string): Doc[] {
  const seen = new Set<string>([docId]);
  const queue = [docId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of eng.links.get(id) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return [...seen]
    .map((id) => eng.byId.get(id)!)
    .filter(Boolean)
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}

export type Tone = 'neutral' | 'info' | 'warn' | 'good' | 'bad';

export function docStatus(d: Doc, eng: Engine, today: string): { label: string; tone: Tone } {
  if (d.status === 'cancelled') return { label: 'Cancelled', tone: 'bad' };
  const lineProg = (i: number) => eng.progress.get(lineKey({ docId: d.id, line: i })) ?? { moved: 0, billed: 0 };
  switch (d.type) {
    case 'PO':
    case 'SO': {
      const sale = d.type === 'SO';
      const all = (f: (p: LineProgress, q: number) => boolean) => d.lines.every((l, i) => f(lineProg(i), l.qty));
      if (all((p, q) => p.billed >= q)) return { label: sale ? 'Invoiced' : 'Billed', tone: 'good' };
      if (all((p, q) => p.moved >= q)) return { label: sale ? 'Delivered' : 'Received', tone: 'info' };
      if (d.lines.some((_, i) => lineProg(i).moved > 0)) return { label: sale ? 'Part delivered' : 'Part received', tone: 'warn' };
      return { label: 'Open', tone: 'neutral' };
    }
    case 'GRN':
    case 'DN': {
      const word = d.type === 'GRN' ? 'billed' : 'invoiced';
      if (d.lines.every((l, i) => lineProg(i).billed >= l.qty)) return { label: cap(word), tone: 'good' };
      if (d.lines.some((_, i) => lineProg(i).billed > 0)) return { label: `Part ${word}`, tone: 'warn' };
      return { label: `To be ${word}`, tone: 'info' };
    }
    case 'PBILL':
    case 'SINV': {
      const o = eng.outstanding.get(d.id);
      if (!o) return { label: 'Posted', tone: 'neutral' };
      if (o.due <= 0.001) return { label: 'Paid', tone: 'good' };
      if (d.dueDate && d.dueDate < today) return { label: 'Overdue', tone: 'bad' };
      if (o.settled > 0) return { label: 'Part paid', tone: 'warn' };
      return { label: 'Unpaid', tone: 'info' };
    }
    case 'PAY':
    case 'RCPT': {
      const u = eng.unallocated.get(d.id) ?? 0;
      if (!eng.parties.has(d.partyId ?? '')) return { label: 'Posted', tone: 'neutral' };
      return u > 0.001 ? { label: 'On account', tone: 'warn' } : { label: 'Settled', tone: 'good' };
    }
    default:
      return { label: 'Posted', tone: 'neutral' };
  }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Integrity checks run on the whole dataset after a change; empty array = OK. */
export function validate(data: Data, eng: Engine, changedId?: string): string[] {
  const errs: string[] = [];
  const doc = changedId ? eng.byId.get(changedId) : undefined;
  const ledgers = new Set(data.ledgers.map((l) => l.id));
  const items = new Set(data.items.map((i) => i.id));
  if (doc && doc.status === 'posted') {
    if (!doc.date) errs.push('Date is required.');
    const needsParty = doc.type !== 'JRNL' && doc.type !== 'CONTRA';
    if (needsParty && (!doc.partyId || !ledgers.has(doc.partyId))) errs.push('Choose a party.');
    if (['PO', 'GRN', 'PBILL', 'SO', 'DN', 'SINV'].includes(doc.type)) {
      if (!doc.lines.length) errs.push('Add at least one item line.');
      doc.lines.forEach((l, i) => {
        if (!items.has(l.itemId)) errs.push(`Line ${i + 1}: choose an item.`);
        if (!(l.qty > 0)) errs.push(`Line ${i + 1}: quantity must be more than zero.`);
        if (l.rate < 0) errs.push(`Line ${i + 1}: rate cannot be negative.`);
        if (l.src) {
          const s = eng.byId.get(l.src.docId);
          if (!s || s.status !== 'posted') errs.push(`Line ${i + 1}: its source document is not active.`);
          else if (s.partyId !== doc.partyId) errs.push(`Line ${i + 1}: source ${s.number} belongs to another party.`);
        }
      });
    }
    if (doc.type === 'PAY' || doc.type === 'RCPT') {
      if (!doc.accountId || !ledgers.has(doc.accountId)) errs.push('Choose a cash or bank account.');
      if (!((doc.amount ?? 0) > 0)) errs.push('Amount must be more than zero.');
      const alloc = (doc.allocations ?? []).reduce((s, a) => s + a.amount, 0);
      if (alloc - (doc.amount ?? 0) > 0.001) errs.push('Bill allocations exceed the amount.');
    }
    if (doc.type === 'JRNL' || doc.type === 'CONTRA') {
      const e = doc.entries ?? [];
      const dr = round2(e.reduce((s, x) => s + x.dr, 0));
      const cr = round2(e.reduce((s, x) => s + x.cr, 0));
      if (e.length < 2) errs.push('A journal needs at least two lines.');
      if (dr !== cr) errs.push(`Debits (${dr}) and credits (${cr}) do not match.`);
      if (dr === 0) errs.push('Amounts are missing.');
      if (e.some((x) => !ledgers.has(x.ledgerId))) errs.push('Every line needs a ledger.');
    }
  }
  // Global: nothing may be fulfilled beyond its quantity, and no bill over-settled.
  for (const [k, p] of eng.progress) {
    const [docId, line] = k.split(':');
    const d = eng.byId.get(docId);
    const l = d?.lines[Number(line)];
    if (!d || !l) continue;
    const name = data.items.find((i) => i.id === l.itemId)?.name ?? 'item';
    if (p.moved - l.qty > 0.001) errs.push(`${d.number}: ${name} would be ${d.type === 'PO' ? 'received' : 'delivered'} beyond the ordered ${l.qty}.`);
    else if (p.billed - l.qty > 0.001) errs.push(`${d.number}: ${name} would be billed beyond ${l.qty}.`);
  }
  for (const [id, o] of eng.outstanding) {
    if (o.due < -0.001) errs.push(`${eng.byId.get(id)?.number}: allocations exceed the bill amount.`);
  }
  return [...new Set(errs)];
}

/** Documents that depend on `docId` and are still posted (block cancellation). */
export function dependents(data: Data, docId: string): Doc[] {
  return data.docs.filter(
    (d) => d.status === 'posted' && d.id !== docId &&
      (d.lines.some((l) => l.src?.docId === docId) || (d.allocations ?? []).some((a) => a.docId === docId)),
  );
}
