import { ReactNode, useEffect, useMemo, useState } from 'react';
import { docStatus } from '../domain/engine';
import { balances, balanceSheet, groupTree, itemPipeline, ledgerStatement, openingDifference, outstandingBills, profitAndLoss, stockSummary, TreeNode } from '../domain/reports';
import { DOC_META } from '../domain/types';
import { drcr, fmtDate, money, qty, todayISO } from '../format';
import { nav, useStore } from '../store';
import { Kbd, PageHead, Pill, useListNav } from './common';
import { particulars } from './Lists';

interface Row { key: string; depth: number; label: ReactNode; amount?: number; node?: TreeNode; kind: 'head' | 'node' | 'total' | 'extra'; sign: 1 | -1 }
interface Section { title: string; nodes: TreeNode[]; sign: 1 | -1; extras?: { label: string; amount: number }[]; totalLabel?: string; total?: number }

function flatten(sections: Section[], open: Set<string>): Row[] {
  const rows: Row[] = [];
  for (const s of sections) {
    rows.push({ key: 'h:' + s.title, depth: 0, label: s.title, kind: 'head', sign: s.sign });
    const walk = (n: TreeNode, depth: number) => {
      rows.push({ key: n.id, depth, label: n.name, amount: n.amount, node: n, kind: 'node', sign: s.sign });
      if (open.has(n.id)) n.children.forEach((c) => walk(c, depth + 1));
    };
    s.nodes.forEach((n) => walk(n, 1));
    for (const e of s.extras ?? []) rows.push({ key: 'e:' + s.title + e.label, depth: 1, label: e.label, amount: e.amount, kind: 'extra', sign: 1 });
    if (s.totalLabel) rows.push({ key: 't:' + s.title, depth: 0, label: s.totalLabel, amount: s.total, kind: 'total', sign: 1 });
  }
  return rows;
}

function allIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.children.length ? [n.id, ...allIds(n.children)] : []));
}

function TreeReport(props: { title: string; sub: ReactNode; sections: Section[]; drcrCols?: boolean; footer?: ReactNode }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(props.sections.flatMap((s) => s.nodes.map((n) => n.id))));
  const rows = flatten(props.sections, open);
  const toggle = (id: string, to?: boolean) => setOpen((o) => { const n = new Set(o); (to ?? !n.has(id)) ? n.add(id) : n.delete(id); return n; });
  const everything = props.sections.flatMap((s) => allIds(s.nodes));
  const list = useListNav(rows.length, (i) => {
    const r = rows[i];
    if (r.node?.ledgerId) nav.go({ name: 'ledger', id: r.node.ledgerId });
    else if (r.node?.children.length) toggle(r.node.id);
  }, {
    onKey: (e, i) => {
      const r = rows[i];
      if (e.key === 'ArrowRight' && r?.node?.children.length) { toggle(r.node.id, true); return true; }
      if (e.key === 'ArrowLeft' && r?.node) { toggle(r.node.id, false); return true; }
      if (e.key === '*' || (e.altKey && e.key === 'F1') || e.key.toLowerCase() === 'a') {
        setOpen(open.size >= everything.length ? new Set() : new Set(everything));
        return true;
      }
      return false;
    },
  });
  return (
    <div>
      <PageHead title={props.title} sub={<>{props.sub} · <Kbd>→</Kbd>/<Kbd>←</Kbd> expand · <Kbd>A</Kbd> expand all · <Kbd>Enter</Kbd> drill down</>} />
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid report">
          <thead><tr><th>Particulars</th>{props.drcrCols ? <><th className="num w-amt">Debit</th><th className="num w-amt">Credit</th></> : <th className="num w-amt">Amount</th>}</tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const a = (r.amount ?? 0) * r.sign;
              const { className, ...rp } = list.rowProps(i);
              const expandable = !!r.node?.children.length;
              return (
                <tr key={r.key} {...rp} className={`${className ?? ''} r-${r.kind} ${r.node?.ledgerId ? 'leaf' : ''}`} onClick={() => { list.setSel(i); if (expandable) toggle(r.node!.id); }}>
                  <td style={{ paddingLeft: 12 + r.depth * 18 }}>{expandable && <span className="caret">{open.has(r.node!.id) ? '▾' : '▸'}</span>}{r.label}</td>
                  {r.kind === 'head' ? (props.drcrCols ? <><td /><td /></> : <td />) : props.drcrCols
                    ? <><td className="num">{a > 0.004 ? money(a) : ''}</td><td className="num">{a < -0.004 ? money(-a) : ''}</td></>
                    : <td className={`num ${a < -0.004 ? 'neg' : ''}`}>{money(a)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {props.footer}
    </div>
  );
}

export function TrialBalance() {
  const { data, eng } = useStore();
  const today = todayISO();
  const bal = balances(data, eng, today);
  const nodes = groupTree(data, bal, ['Equity', 'Liability', 'Asset', 'Income', 'Expense']);
  const dr = [...bal.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const cr = -[...bal.values()].filter((v) => v < 0).reduce((s, v) => s + v, 0);
  const diff = openingDifference(data);
  return (
    <TreeReport title="Trial Balance" sub={`${data.company.name} · as on ${fmtDate(today)}`} drcrCols
      sections={[{ title: 'Ledger balances', nodes, sign: 1, extras: Math.abs(diff) > 0.004 ? [{ label: 'Difference in opening balances', amount: -diff }] : undefined }]}
      footer={<div className="totals-bar"><span>Grand total</span><span className="num">Dr {money(dr)}</span><span className="num">Cr {money(cr)}</span>{Math.abs(dr - cr - diff) < 0.01 ? <Pill tone="good">Tallied</Pill> : <Pill tone="bad">Off by {money(dr - cr)}</Pill>}</div>} />
  );
}

export function ProfitLoss() {
  const { data, eng } = useStore();
  const today = todayISO();
  const pl = profitAndLoss(data, eng, data.company.fyStart, today);
  return (
    <TreeReport title="Profit & Loss" sub={`${fmtDate(data.company.fyStart)} to ${fmtDate(today)}`}
      sections={[
        { title: 'Sales and direct income', nodes: pl.directIncome, sign: -1 },
        { title: 'Cost of sales and direct expenses', nodes: pl.directExpense, sign: 1, totalLabel: 'Gross profit', total: pl.gross },
        { title: 'Indirect income', nodes: pl.indirectIncome, sign: -1 },
        { title: 'Indirect expenses', nodes: pl.indirectExpense, sign: 1, totalLabel: pl.net >= 0 ? 'Net profit' : 'Net loss', total: pl.net },
      ]} />
  );
}

export function BalanceSheet() {
  const { data, eng } = useStore();
  const today = todayISO();
  const bs = balanceSheet(data, eng, data.company.fyStart, today);
  const extras = [{ label: 'Profit & Loss A/c (current period)', amount: bs.profit }];
  if (Math.abs(bs.diff) > 0.004) extras.push({ label: 'Difference in opening balances', amount: bs.diff });
  return (
    <TreeReport title="Balance Sheet" sub={`as on ${fmtDate(today)}`}
      sections={[
        { title: 'Capital and liabilities', nodes: bs.liabilities, sign: -1, extras, totalLabel: 'Total', total: bs.totalLiab },
        { title: 'Assets', nodes: bs.assets, sign: 1, totalLabel: 'Total', total: bs.totalAssets },
      ]}
      footer={<div className="totals-bar">{Math.abs(bs.totalAssets - bs.totalLiab) < 0.01 ? <Pill tone="good">Balanced</Pill> : <Pill tone="bad">Out by {money(bs.totalAssets - bs.totalLiab)}</Pill>}</div>} />
  );
}

export function LedgerView({ id }: { id: string }) {
  const { data, eng } = useStore();
  const st = ledgerStatement(data, eng, id);
  const rows = [...st.rows].reverse();
  const isParty = ['G_DEBT', 'G_CRED'].includes(st.ledger.groupId);
  const list = useListNav(rows.length, (i) => nav.go({ name: 'doc', id: rows[i].doc.id, type: rows[i].doc.type }), {
    onKey: (e) => {
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey) { nav.go({ name: 'ledgerForm', id }); return true; }
      return false;
    },
  });
  return (
    <div>
      <PageHead title={st.ledger.name} sub={<>Ledger statement · newest first · <Kbd>Enter</Kbd> open voucher · <Kbd>M</Kbd> edit master</>}>
        {isParty && <button onClick={() => nav.go({ name: 'doc', type: st.ledger.groupId === 'G_DEBT' ? 'RCPT' : 'PAY', prefill: { partyId: id } })}>{st.ledger.groupId === 'G_DEBT' ? 'Record receipt' : 'Make payment'}</button>}
      </PageHead>
      <div className="stat-row">
        <div className="stat"><span>Opening</span><strong>{drcr(st.opening)}</strong></div>
        <div className="stat"><span>Debits</span><strong>{money(st.rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0))}</strong></div>
        <div className="stat"><span>Credits</span><strong>{money(-st.rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0))}</strong></div>
        <div className="stat"><span>Closing</span><strong>{drcr(st.closing)}</strong></div>
      </div>
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid list">
          <thead><tr><th className="w-date">Date</th><th>Particulars</th><th>Voucher</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} {...list.rowProps(i)}>
                <td>{fmtDate(r.date)}</td>
                <td>{r.against}<span className="muted small"> {r.doc.narration}</span></td>
                <td><span className="mono">{r.doc.number}</span> <span className="muted small">{DOC_META[r.doc.type].short}</span></td>
                <td className="num">{r.amount > 0 ? money(r.amount) : ''}</td>
                <td className="num">{r.amount < 0 ? money(-r.amount) : ''}</td>
                <td className="num">{drcr(r.running)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted empty-row">No transactions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StockSummary() {
  const { data, eng } = useStore();
  const rows = stockSummary(data, eng);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const list = useListNav(rows.length, (i) => nav.go({ name: 'item', id: rows[i].item.id }));
  return (
    <div>
      <PageHead title="Stock Summary" sub={<>Moving-average valuation · <Kbd>Enter</Kbd> item movements</>}>
        <button onClick={() => nav.go({ name: 'itemForm' })}>New item</button>
      </PageHead>
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid list">
          <thead><tr><th>Item</th><th className="num">Inward</th><th className="num">Outward</th><th className="num">In stock</th><th className="num">On order</th><th className="num">Committed</th><th className="num">Avg rate</th><th className="num">Value</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const p = itemPipeline(data, eng, r.item.id);
              return (
                <tr key={r.item.id} {...list.rowProps(i)}>
                  <td>{r.item.name} <span className="muted small">{r.item.sku}</span> {r.low && <Pill tone="warn">Reorder</Pill>}</td>
                  <td className="num">{qty(r.inQty)}</td>
                  <td className="num">{qty(r.outQty)}</td>
                  <td className="num"><strong>{qty(r.qty)}</strong> <span className="muted small">{r.item.unit}</span></td>
                  <td className="num muted">{p.onOrder ? qty(p.onOrder) : ''}</td>
                  <td className="num muted">{p.committed ? qty(p.committed) : ''}</td>
                  <td className="num">{money(r.rate)}</td>
                  <td className="num">{money(r.value)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan={7}>Closing stock value</td><td className="num"><strong>{money(total)}</strong></td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

export function ItemView({ id }: { id: string }) {
  const { data, eng } = useStore();
  const it = data.items.find((i) => i.id === id)!;
  const moves = useMemo(() => {
    let q = it.openingQty;
    return eng.moves.filter((m) => m.itemId === id).map((m) => ({ m, running: (q += m.qty) })).reverse();
  }, [eng, id, it.openingQty]);
  const p = itemPipeline(data, eng, id);
  const list = useListNav(moves.length, (i) => { const d = eng.byId.get(moves[i].m.docId)!; nav.go({ name: 'doc', id: d.id, type: d.type }); }, {
    onKey: (e) => { if (e.key.toLowerCase() === 'm') { nav.go({ name: 'itemForm', id }); return true; } return false; },
  });
  const cur = moves[0]?.running ?? it.openingQty;
  return (
    <div>
      <PageHead title={it.name} sub={<>Stock item · {it.sku} · <Kbd>M</Kbd> edit master</>} />
      <div className="stat-row">
        <div className="stat"><span>In stock</span><strong>{qty(cur)} {it.unit}</strong></div>
        <div className="stat"><span>On order</span><strong>{qty(p.onOrder)}</strong></div>
        <div className="stat"><span>Committed to customers</span><strong>{qty(p.committed)}</strong></div>
        <div className="stat"><span>Available</span><strong>{qty(cur + p.onOrder - p.committed)}</strong></div>
      </div>
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid list">
          <thead><tr><th className="w-date">Date</th><th>Voucher</th><th>Party</th><th className="num">In</th><th className="num">Out</th><th className="num">Value</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {moves.map(({ m, running }, i) => {
              const d = eng.byId.get(m.docId)!;
              return (
                <tr key={i} {...list.rowProps(i)}>
                  <td>{fmtDate(m.date)}</td>
                  <td><span className="mono">{d.number}</span> <span className="muted small">{DOC_META[d.type].short}</span></td>
                  <td>{particulars(data, d)}</td>
                  <td className="num pos">{m.qty > 0 ? qty(m.qty) : ''}</td>
                  <td className="num neg">{m.qty < 0 ? qty(-m.qty) : ''}</td>
                  <td className="num">{money(Math.abs(m.value))}</td>
                  <td className="num">{qty(running)}</td>
                </tr>
              );
            })}
            <tr className="muted"><td colSpan={6}>Opening stock</td><td className="num">{qty(it.openingQty)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OutstandingView({ side }: { side: 'receivable' | 'payable' }) {
  const { data, eng } = useStore();
  const today = todayISO();
  const rows = outstandingBills(data, eng, side, today);
  const buckets = [
    { label: 'Not due', test: (o: number) => o <= 0 },
    { label: '1–30 days late', test: (o: number) => o > 0 && o <= 30 },
    { label: '31–60', test: (o: number) => o > 30 && o <= 60 },
    { label: '61–90', test: (o: number) => o > 60 && o <= 90 },
    { label: '90+', test: (o: number) => o > 90 },
  ];
  const settleType = side === 'receivable' ? 'RCPT' : 'PAY';
  const list = useListNav(rows.length, (i) => nav.go({ name: 'doc', id: rows[i].doc.id, type: rows[i].doc.type }), {
    onKey: (e, i) => {
      if (e.key.toLowerCase() === 'p' && rows[i]) {
        const r = rows[i];
        nav.go({ name: 'doc', type: settleType, prefill: { partyId: r.doc.partyId, amount: r.due, allocations: [{ docId: r.doc.id, amount: r.due }], accountId: 'L_HDFC' } });
        return true;
      }
      if (e.key === 'Tab') { nav.replace({ name: 'report', report: side === 'receivable' ? 'payable' : 'receivable' }); return true; }
      return false;
    },
  });
  useEffect(() => list.ref.current?.focus(), [side]); // eslint-disable-line
  return (
    <div>
      <PageHead title={side === 'receivable' ? 'Receivables' : 'Payables'} sub={<>Bill-wise outstanding · <Kbd>P</Kbd> {side === 'receivable' ? 'record receipt' : 'make payment'} · <Kbd>Tab</Kbd> {side === 'receivable' ? 'payables' : 'receivables'}</>} />
      <div className="stat-row">
        {buckets.map((b) => {
          const sum = rows.filter((r) => b.test(r.overdue)).reduce((s, r) => s + r.due, 0);
          return <div key={b.label} className={`stat ${b.label !== 'Not due' && sum ? 'warn' : ''}`}><span>{b.label}</span><strong>{money(sum)}</strong></div>;
        })}
      </div>
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid list">
          <thead><tr><th className="w-date">Date</th><th>Bill</th><th>Party</th><th className="w-date">Due</th><th className="num">Bill amount</th><th className="num">Pending</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const st = docStatus(r.doc, eng, today);
              return (
                <tr key={r.doc.id} {...list.rowProps(i)}>
                  <td>{fmtDate(r.doc.date)}</td>
                  <td className="mono">{r.doc.number}</td>
                  <td>{particulars(data, r.doc)}</td>
                  <td>{fmtDate(r.doc.dueDate)}{r.overdue > 0 && <span className="neg small"> +{r.overdue}d</span>}</td>
                  <td className="num">{money(r.total)}</td>
                  <td className="num"><strong>{money(r.due)}</strong></td>
                  <td><Pill tone={st.tone}>{st.label}</Pill></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="muted empty-row">All settled.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={5}>Total pending</td><td className="num"><strong>{money(rows.reduce((s, r) => s + r.due, 0))}</strong></td><td /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
