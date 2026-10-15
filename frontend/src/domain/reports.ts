import { Engine, round2 } from './engine';
import { Data, Doc, Group, Ledger, Nature, SYS } from './types';

export function groupPath(data: Data, groupId: string): Group[] {
  const out: Group[] = [];
  let g = data.groups.find((x) => x.id === groupId);
  while (g) {
    out.unshift(g);
    g = g.parentId ? data.groups.find((x) => x.id === g!.parentId) : undefined;
  }
  return out;
}

export const natureOf = (data: Data, groupId: string): Nature => groupPath(data, groupId)[0]?.nature ?? 'Asset';
export const isDirect = (data: Data, groupId: string) => groupPath(data, groupId).some((g) => g.direct);
export const inGroup = (data: Data, ledger: Ledger, groupId: string) => groupPath(data, ledger.groupId).some((g) => g.id === groupId);

/** Opening balance of a ledger; Stock-in-Hand opening comes from item opening stock. */
export function openingOf(data: Data, l: Ledger): number {
  if (l.id === SYS.stock) return round2(data.items.reduce((s, i) => s + i.openingQty * i.openingRate, 0));
  return l.opening;
}

export function balances(data: Data, eng: Engine, asOn?: string, from?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of data.ledgers) {
    const pl = ['Income', 'Expense'].includes(natureOf(data, l.groupId));
    m.set(l.id, from && pl ? 0 : openingOf(data, l));
  }
  for (const p of eng.postings) {
    if (asOn && p.date > asOn) continue;
    const pl = ['Income', 'Expense'].includes(natureOf(data, data.ledgers.find((l) => l.id === p.ledgerId)?.groupId ?? ''));
    if (from && pl && p.date < from) continue;
    m.set(p.ledgerId, round2((m.get(p.ledgerId) ?? 0) + p.amount));
  }
  return m;
}

export function openingDifference(data: Data): number {
  return round2(data.ledgers.reduce((s, l) => s + openingOf(data, l), 0));
}

export interface TreeNode { id: string; name: string; amount: number; children: TreeNode[]; ledgerId?: string }

/** Tree of groups → ledgers with balances (Dr positive), pruned of zero rows. */
export function groupTree(data: Data, bal: Map<string, number>, natures: Nature[], filter?: (g: Group) => boolean): TreeNode[] {
  const build = (g: Group): TreeNode => {
    const children: TreeNode[] = [
      ...data.groups.filter((c) => c.parentId === g.id).map(build),
      ...data.ledgers
        .filter((l) => l.groupId === g.id)
        .map((l) => ({ id: l.id, ledgerId: l.id, name: l.name, amount: bal.get(l.id) ?? 0, children: [] })),
    ].filter((n) => Math.abs(n.amount) > 0.001 || n.children.length);
    return { id: g.id, name: g.name, amount: round2(children.reduce((s, c) => s + c.amount, 0)), children };
  };
  return data.groups
    .filter((g) => !g.parentId && natures.includes(g.nature) && (!filter || filter(g)))
    .map(build)
    .filter((n) => Math.abs(n.amount) > 0.001 || n.children.length);
}

export function profitAndLoss(data: Data, eng: Engine, from: string, to: string) {
  const bal = balances(data, eng, to, from);
  const tree = (natures: Nature[], direct: boolean) =>
    groupTree(data, bal, natures, (g) => !!g.direct === direct);
  const directIncome = tree(['Income'], true);
  const directExpense = tree(['Expense'], true);
  const indirectIncome = tree(['Income'], false);
  const indirectExpense = tree(['Expense'], false);
  const sum = (ns: TreeNode[]) => round2(ns.reduce((s, n) => s + n.amount, 0));
  const gross = round2(-sum(directIncome) - sum(directExpense));
  const net = round2(gross - sum(indirectIncome) - sum(indirectExpense));
  return { directIncome, directExpense, indirectIncome, indirectExpense, gross, net };
}

export function balanceSheet(data: Data, eng: Engine, fyStart: string, asOn: string) {
  const bal = balances(data, eng, asOn);
  const assets = groupTree(data, bal, ['Asset']);
  const liabilities = groupTree(data, bal, ['Liability', 'Equity']);
  const pl = profitAndLoss(data, eng, fyStart, asOn);
  const sum = (ns: TreeNode[]) => round2(ns.reduce((s, n) => s + n.amount, 0));
  const diff = openingDifference(data);
  return { assets, liabilities, profit: pl.net, totalAssets: sum(assets), totalLiab: round2(-sum(liabilities) + pl.net + diff), diff };
}

export interface StatementRow { doc: Doc; date: string; amount: number; running: number; against: string }

export function ledgerStatement(data: Data, eng: Engine, ledgerId: string) {
  const l = data.ledgers.find((x) => x.id === ledgerId)!;
  const opening = openingOf(data, l);
  let running = opening;
  const rows: StatementRow[] = [];
  const name = (id: string) => data.ledgers.find((x) => x.id === id)?.name ?? '';
  for (const p of eng.postings) {
    if (p.ledgerId !== ledgerId) continue;
    running = round2(running + p.amount);
    // "Against" = the biggest opposite-side leg of the same document, like Tally's particulars column.
    const legs = eng.postings.filter((q) => q.docId === p.docId && q.ledgerId !== ledgerId && Math.sign(q.amount) !== Math.sign(p.amount));
    legs.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    rows.push({ doc: eng.byId.get(p.docId)!, date: p.date, amount: p.amount, running, against: legs.length ? name(legs[0].ledgerId) + (legs.length > 1 ? ' + more' : '') : '' });
  }
  return { ledger: l, opening, rows, closing: running };
}

export function stockSummary(data: Data, eng: Engine, asOn?: string) {
  return data.items.map((it) => {
    let qty = it.openingQty;
    let value = round2(it.openingQty * it.openingRate);
    let inQty = 0;
    let outQty = 0;
    for (const m of eng.moves) {
      if (m.itemId !== it.id || (asOn && m.date > asOn)) continue;
      qty += m.qty;
      value = round2(value + m.value);
      if (m.qty > 0) inQty += m.qty; else outQty -= m.qty;
    }
    if (qty === 0) value = 0;
    return { item: it, inQty, outQty, qty, value, rate: qty ? round2(value / qty) : 0, low: qty <= it.reorderLevel };
  });
}

/** Quantity on order (open PO) and committed (open SO) for an item. */
export function itemPipeline(data: Data, eng: Engine, itemId: string) {
  let onOrder = 0;
  let committed = 0;
  for (const d of data.docs) {
    if (d.status !== 'posted' || (d.type !== 'PO' && d.type !== 'SO')) continue;
    d.lines.forEach((l, i) => {
      if (l.itemId !== itemId) return;
      const open = l.qty - (eng.progress.get(`${d.id}:${i}`)?.moved ?? 0);
      if (open > 0) d.type === 'PO' ? (onOrder += open) : (committed += open);
    });
  }
  return { onOrder, committed };
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function outstandingBills(data: Data, eng: Engine, side: 'receivable' | 'payable', today: string) {
  const type = side === 'receivable' ? 'SINV' : 'PBILL';
  return data.docs
    .filter((d) => d.type === type && d.status === 'posted' && (eng.outstanding.get(d.id)?.due ?? 0) > 0.001)
    .map((d) => {
      const o = eng.outstanding.get(d.id)!;
      const overdue = d.dueDate ? daysBetween(d.dueDate, today) : 0;
      return { doc: d, ...o, overdue, age: daysBetween(d.date, today) };
    })
    .sort((a, b) => a.doc.date.localeCompare(b.doc.date));
}
