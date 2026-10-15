import { useEffect, useMemo, useRef, useState } from 'react';
import { docStatus, Engine, lineKey, round2 } from '../domain/engine';
import { Data, Doc, DocType, DOC_META } from '../domain/types';
import { compact, fmtDate, money, todayISO } from '../format';
import { nav, useStore } from '../store';
import { Kbd, PageHead, Pill, useListNav } from './common';
import { daysBetween } from '../domain/reports';

const FILTERS: { id: string; label: string; types: DocType[] }[] = [
  { id: 'all', label: 'All', types: Object.keys(DOC_META) as DocType[] },
  { id: 'purchase', label: 'Purchase', types: ['PO', 'GRN', 'PBILL', 'PAY'] },
  { id: 'sales', label: 'Sales', types: ['SO', 'DN', 'SINV', 'RCPT'] },
  { id: 'accounts', label: 'Vouchers', types: ['PAY', 'RCPT', 'JRNL', 'CONTRA'] },
  ...(Object.keys(DOC_META) as DocType[]).map((t) => ({ id: t, label: DOC_META[t].short, types: [t] })),
];

/** Day Book: every document, newest first, filterable and searchable. */
export function DocList({ filter = 'all' }: { filter?: string }) {
  const { data, eng } = useStore();
  const [f, setF] = useState(filter);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const today = todayISO();
  const types = FILTERS.find((x) => x.id === f)?.types ?? [];
  const party = (d: Doc) => data.ledgers.find((l) => l.id === d.partyId)?.name ?? '';
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.docs
      .filter((d) => types.includes(d.type))
      .filter((d) => !words.length || words.every((w) => `${d.number} ${party(d)} ${d.narration} ${DOC_META[d.type].label}`.toLowerCase().includes(w)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  }, [data, f, q]); // eslint-disable-line
  const single = types.length === 1 ? types[0] : undefined;
  const list = useListNav(rows.length, (i) => nav.go({ name: 'doc', id: rows[i].id, type: rows[i].type }), {
    onKey: (e) => {
      if (e.key === '/') { searchRef.current?.focus(); return true; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const i = FILTERS.findIndex((x) => x.id === f);
        setF(FILTERS[(i + (e.key === 'ArrowRight' ? 1 : FILTERS.length - 1)) % FILTERS.length].id);
        return true;
      }
      if (e.key.toLowerCase() === 'n' && single) { nav.go({ name: 'doc', type: single }); return true; }
      return false;
    },
  });
  return (
    <div>
      <PageHead title="Day Book" sub={<><Kbd>←</Kbd><Kbd>→</Kbd> switch type · <Kbd>/</Kbd> search · <Kbd>Enter</Kbd> open{single && <> · <Kbd>N</Kbd> new {DOC_META[single].label}</>}</>}>
        <input ref={searchRef} className="search" placeholder="Search number, party, narration" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); list.ref.current?.focus(); } if (e.key === 'Escape' && q) { e.preventDefault(); setQ(''); } }} />
      </PageHead>
      <div className="chips">
        {FILTERS.map((x) => <button key={x.id} className={x.id === f ? 'chip on' : 'chip'} onClick={() => setF(x.id)}>{x.label}</button>)}
      </div>
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid list">
          <thead><tr><th className="w-date">Date</th><th>Number</th><th>Type</th><th>Party / particulars</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((d, i) => {
              const st = docStatus(d, eng, today);
              return (
                <tr key={d.id} {...list.rowProps(i)} onClick={() => list.setSel(i)}>
                  <td>{fmtDate(d.date)}</td>
                  <td className="mono">{d.number}</td>
                  <td>{DOC_META[d.type].label}</td>
                  <td>{particulars(data, d)}<span className="muted small"> {d.narration}</span></td>
                  <td className="num">{money(eng.docValue.get(d.id) ?? 0)}</td>
                  <td><Pill tone={st.tone}>{st.label}</Pill></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="muted empty-row">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function particulars(data: Data, d: Doc) {
  if (d.partyId) return data.ledgers.find((l) => l.id === d.partyId)?.name;
  return (d.entries ?? []).filter((e) => e.dr).map((e) => data.ledgers.find((l) => l.id === e.ledgerId)?.name).join(', ');
}

interface Card { doc: Doc; value: number; age: number; note?: string; tone?: 'bad' | 'warn' }

/** Where every order is right now: the cycle board. */
export function cycleColumns(data: Data, eng: Engine, side: 'purchase' | 'sales', today: string) {
  const P = side === 'purchase';
  const [ORD, MOVE, BILL] = P ? (['PO', 'GRN', 'PBILL'] as const) : (['SO', 'DN', 'SINV'] as const);
  const posted = (t: DocType) => data.docs.filter((d) => d.type === t && d.status === 'posted');
  const openValue = (d: Doc, field: 'moved' | 'billed') =>
    round2(d.lines.reduce((s, l, i) => s + Math.max(0, l.qty - (eng.progress.get(lineKey({ docId: d.id, line: i }))?.[field] ?? 0)) * l.rate, 0));
  const ordered: Card[] = posted(ORD).map((d) => ({ doc: d, value: openValue(d, 'moved'), age: daysBetween(d.date, today) })).filter((c) => c.value > 0.001);
  const moved: Card[] = posted(MOVE).map((d) => ({ doc: d, value: openValue(d, 'billed'), age: daysBetween(d.date, today) })).filter((c) => c.value > 0.001)
    .map((c) => ({ ...c, tone: c.age > 7 ? 'warn' as const : undefined, note: c.age > 7 ? `${c.age} days without a ${P ? 'bill' : 'invoice'}` : undefined }));
  const billed: Card[] = posted(BILL).map((d) => {
    const o = eng.outstanding.get(d.id)!;
    const late = d.dueDate && d.dueDate < today ? daysBetween(d.dueDate, today) : 0;
    return { doc: d, value: o.due, age: daysBetween(d.date, today), tone: late ? 'bad' as const : undefined, note: late ? `${late} days overdue` : d.dueDate ? `due ${fmtDate(d.dueDate)}` : undefined };
  }).filter((c) => c.value > 0.001);
  const settled: Card[] = posted(BILL).filter((d) => (eng.outstanding.get(d.id)?.due ?? 1) <= 0.001)
    .map((d) => ({ doc: d, value: eng.outstanding.get(d.id)!.total, age: daysBetween(d.date, today) }))
    .filter((c) => c.age <= 90);
  return [
    { title: P ? 'Ordered, not received' : 'Ordered, not delivered', hint: P ? 'R on a PO to receive' : 'D on an SO to deliver', cards: ordered },
    { title: P ? 'Received, not billed' : 'Delivered, not invoiced', hint: P ? 'B to enter the bill' : 'I to invoice', cards: moved },
    { title: P ? 'Billed, to pay' : 'Invoiced, to collect', hint: 'P to settle', cards: billed },
    { title: P ? 'Paid (90 days)' : 'Collected (90 days)', hint: '', cards: settled },
  ];
}

export function CycleBoard({ side }: { side: 'purchase' | 'sales' }) {
  const { data, eng } = useStore();
  const today = todayISO();
  const cols = cycleColumns(data, eng, side, today);
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [side]);
  const party = (d: Doc) => data.ledgers.find((l) => l.id === d.partyId)?.name;
  const onKeyDown = (e: React.KeyboardEvent) => {
    let [c, r] = pos;
    if (e.key === 'ArrowRight') c = Math.min(cols.length - 1, c + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowDown') r += 1;
    else if (e.key === 'ArrowUp') r -= 1;
    else if (e.key === 'Enter') { const card = cols[c].cards[r]; if (card) nav.go({ name: 'doc', id: card.doc.id, type: card.doc.type }); e.preventDefault(); return; }
    else if (e.key === 'Tab') { e.preventDefault(); nav.replace({ name: 'cycle', side: side === 'purchase' ? 'sales' : 'purchase' }); return; }
    else return;
    e.preventDefault();
    r = Math.max(0, Math.min(cols[c].cards.length - 1, r));
    setPos([c, r]);
    requestAnimationFrame(() => ref.current?.querySelector('.kcard.sel')?.scrollIntoView({ block: 'nearest' }));
  };
  return (
    <div>
      <PageHead title={side === 'purchase' ? 'Purchase cycle' : 'Sales cycle'} sub={<>Every open order, from {side === 'purchase' ? 'PO to payment' : 'SO to collection'} · <Kbd>←</Kbd><Kbd>→</Kbd><Kbd>↑</Kbd><Kbd>↓</Kbd> move · <Kbd>Enter</Kbd> open · <Kbd>Tab</Kbd> {side === 'purchase' ? 'sales' : 'purchase'} cycle</>}>
        <button onClick={() => nav.replace({ name: 'cycle', side: side === 'purchase' ? 'sales' : 'purchase' })}>Switch to {side === 'purchase' ? 'sales' : 'purchase'}</button>
      </PageHead>
      <div className="board" tabIndex={0} ref={ref} onKeyDown={onKeyDown}>
        {cols.map((col, ci) => (
          <div className="col" key={col.title}>
            <div className="col-head">
              <div>{col.title}</div>
              <div className="col-total">{compact(col.cards.reduce((s, c) => s + c.value, 0))} <span className="muted">· {col.cards.length}</span></div>
            </div>
            {col.cards.map((c, ri) => (
              <div key={c.doc.id} className={`kcard ${c.tone ?? ''} ${pos[0] === ci && pos[1] === ri ? 'sel' : ''}`}
                onClick={() => setPos([ci, ri])} onDoubleClick={() => nav.go({ name: 'doc', id: c.doc.id, type: c.doc.type })}>
                <div className="kc-top"><span className="mono">{c.doc.number}</span><span>₹ {money(c.value)}</span></div>
                <div className="kc-party">{party(c.doc)}</div>
                <div className="kc-meta muted small">{fmtDate(c.doc.date)} · {c.note ?? `${c.age} days`}</div>
              </div>
            ))}
            {!col.cards.length && <div className="muted small empty-col">Nothing here</div>}
            {col.hint && <div className="col-hint muted small">{col.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
