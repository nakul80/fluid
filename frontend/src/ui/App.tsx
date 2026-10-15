import { useEffect, useMemo, useRef, useState } from 'react';
import { docStatus } from '../domain/engine';
import { balances, outstandingBills, profitAndLoss, stockSummary } from '../domain/reports';
import { CASH_GROUPS } from '../domain/seed';
import { DocType, DOC_META } from '../domain/types';
import { compact, fmtDate, money, todayISO } from '../format';
import { getState, nav, resetDemo, setPalette, useStore, View } from '../store';
import { Kbd, PageHead, Pill, useListNav } from './common';
import { DocScreen } from './DocForm';
import { CycleBoard, cycleColumns, DocList, particulars } from './Lists';
import { ItemForm, LedgerForm, MastersList } from './Masters';
import { underGroups } from './options';
import { BalanceSheet, ItemView, LedgerView, OutstandingView, ProfitLoss, StockSummary, TrialBalance } from './Reports';

interface MenuItem { key: string; label: string; view: View }
const MENU: { title: string; items: MenuItem[] }[] = [
  { title: 'Work', items: [
    { key: 'h', label: 'Home', view: { name: 'dashboard' } },
    { key: 'd', label: 'Day Book', view: { name: 'docs' } },
    { key: 'u', label: 'Purchase cycle', view: { name: 'cycle', side: 'purchase' } },
    { key: 's', label: 'Sales cycle', view: { name: 'cycle', side: 'sales' } },
  ] },
  { title: 'Reports', items: [
    { key: 'r', label: 'Receivables', view: { name: 'report', report: 'receivable' } },
    { key: 'y', label: 'Payables', view: { name: 'report', report: 'payable' } },
    { key: 'k', label: 'Stock Summary', view: { name: 'report', report: 'stock' } },
    { key: 't', label: 'Trial Balance', view: { name: 'report', report: 'tb' } },
    { key: 'p', label: 'Profit & Loss', view: { name: 'report', report: 'pl' } },
    { key: 'b', label: 'Balance Sheet', view: { name: 'report', report: 'bs' } },
  ] },
  { title: 'Masters', items: [
    { key: 'l', label: 'Ledgers', view: { name: 'masters', kind: 'ledgers' } },
    { key: 'i', label: 'Stock items', view: { name: 'masters', kind: 'items' } },
  ] },
];

const CREATE: DocType[] = ['PBILL', 'SINV', 'PAY', 'RCPT', 'JRNL', 'CONTRA', 'PO', 'SO', 'GRN', 'DN'];

function keyToDocType(e: KeyboardEvent): DocType | undefined {
  const sig = `${e.shiftKey ? 'Shift+' : ''}${e.altKey ? 'Alt+' : ''}${e.key}`;
  return (Object.keys(DOC_META) as DocType[]).find((t) => DOC_META[t].key === sig);
}

const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

function applyTheme(t: string) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('fluid-erp:theme', t); } catch { /* ignore */ }
}

export function App() {
  const st = useStore();
  const view = st.nav[st.nav.length - 1];
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('fluid-erp:theme') ?? ''; } catch { return ''; } });
  const gPending = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => { if (theme) applyTheme(theme); }, [theme]);
  useEffect(() => { setMenuOpen(false); mainRef.current?.scrollTo(0, 0); }, [view]);

  useEffect(() => {
    // Capture phase: creation keys, the command bar and "G <letter>" chords win over screen-level keys.
    const capture = (e: KeyboardEvent) => {
      const t = keyToDocType(e);
      if (t) { e.preventDefault(); e.stopPropagation(); nav.go({ name: 'doc', type: t }); return; }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.altKey && e.key.toLowerCase() === 'g')) {
        e.preventDefault(); e.stopPropagation(); setPalette(!getState().palette); return;
      }
      if (Date.now() - gPending.current < 1500 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        gPending.current = 0;
        const item = MENU.flatMap((m) => m.items).find((i) => i.key === e.key.toLowerCase());
        if (item) { e.preventDefault(); e.stopPropagation(); nav.home(item.view.name === 'dashboard' ? undefined : item.view); }
      }
    };
    const bubble = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        if (getState().palette) setPalette(false);
        else if (!document.querySelector('.modal')) nav.back();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || getState().palette) return;
      if ((e.target as HTMLElement).closest('input,textarea,select,.modal')) return;
      const k = e.key.toLowerCase();
      if (getState().nav.at(-1)!.name === 'dashboard') {
        const item = MENU.flatMap((m) => m.items).find((i) => i.key === k);
        if (item) { e.preventDefault(); if (item.view.name !== 'dashboard') nav.home(item.view); return; }
      }
      if (k === 'g') { gPending.current = Date.now(); e.preventDefault(); }
    };
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keydown', bubble);
    return () => { window.removeEventListener('keydown', capture, true); window.removeEventListener('keydown', bubble); };
  }, []);

  const toggleTheme = () => {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(dark ? 'light' : 'dark');
  };

  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span className="logo">ƒ</span> Fluid ERP</div>
        <div className="company">{st.data.company.name}<small>FY {st.data.company.fyStart.slice(0, 4)}–{String(Number(st.data.company.fyStart.slice(0, 4)) + 1).slice(2)}</small></div>
        {MENU.map((sec) => (
          <nav key={sec.title}>
            <h5>{sec.title}</h5>
            {sec.items.map((it) => (
              <button key={it.key} className={sameView(view, it.view) ? 'on' : ''} onClick={() => nav.home(it.view.name === 'dashboard' ? undefined : it.view)}>
                <span>{it.label}</span><Kbd>{view.name === 'dashboard' ? it.key.toUpperCase() : `G ${it.key.toUpperCase()}`}</Kbd>
              </button>
            ))}
          </nav>
        ))}
        <nav>
          <h5>Create</h5>
          {CREATE.map((t) => (
            <button key={t} className={view.name === 'doc' && !view.id && view.type === t ? 'on' : ''} onClick={() => nav.go({ name: 'doc', type: t })}>
              <span>{DOC_META[t].label}</span><Kbd>{DOC_META[t].key}</Kbd>
            </button>
          ))}
        </nav>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">☰</button>
          {st.nav.length > 1 && <button className="back" onClick={() => nav.back()}><Kbd>Esc</Kbd> Back</button>}
          <button className="search-btn" onClick={() => setPalette(true)}>Go to anything… <Kbd>Ctrl+K</Kbd></button>
          <div className="spacer" />
          <span className="today">{fmtDate(todayISO())}</span>
          <button className="icon" onClick={toggleTheme} title="Light / dark">◐</button>
        </header>
        <main ref={mainRef}><Screen view={view} /></main>
      </div>
      {st.palette && <Palette />}
      {st.toast && <div key={st.toast.at} className={`toast ${st.toast.tone}`}>{st.toast.text}</div>}
    </div>
  );
}

function Screen({ view }: { view: View }) {
  switch (view.name) {
    case 'dashboard': return <Dashboard />;
    case 'docs': return <DocList filter={view.filter} />;
    case 'doc': return <DocScreen view={view} />;
    case 'cycle': return <CycleBoard key={view.side} side={view.side} />;
    case 'ledger': return <LedgerView key={view.id} id={view.id} />;
    case 'item': return <ItemView key={view.id} id={view.id} />;
    case 'masters': return <MastersList key={view.kind} kind={view.kind} />;
    case 'ledgerForm': return <LedgerForm key={view.id ?? 'new'} id={view.id} groupId={view.groupId} />;
    case 'itemForm': return <ItemForm key={view.id ?? 'new'} id={view.id} />;
    case 'report':
      switch (view.report) {
        case 'tb': return <TrialBalance />;
        case 'pl': return <ProfitLoss />;
        case 'bs': return <BalanceSheet />;
        case 'stock': return <StockSummary />;
        case 'receivable':
        case 'payable': return <OutstandingView key={view.report} side={view.report} />;
      }
  }
}

function Dashboard() {
  const { data, eng } = useStore();
  const today = todayISO();
  const bal = balances(data, eng, today);
  const cash = data.ledgers.filter(underGroups(data, CASH_GROUPS)).reduce((s, l) => s + (bal.get(l.id) ?? 0), 0);
  const recv = outstandingBills(data, eng, 'receivable', today);
  const pay = outstandingBills(data, eng, 'payable', today);
  const stock = stockSummary(data, eng);
  const pl = profitAndLoss(data, eng, data.company.fyStart, today);
  const sales = -pl.directIncome.reduce((s, n) => s + n.amount, 0);
  const sum = (xs: { due: number }[]) => xs.reduce((s, x) => s + x.due, 0);

  const attention = useMemo(() => {
    const out: { text: string; sub: string; tone: 'bad' | 'warn' | 'info'; view: View }[] = [];
    for (const r of recv.filter((r) => r.overdue > 0)) out.push({ text: `${r.doc.number} from ${particulars(data, r.doc)} is ${r.overdue} days overdue`, sub: `₹ ${money(r.due)} to collect`, tone: 'bad', view: { name: 'doc', id: r.doc.id, type: r.doc.type } });
    for (const r of pay.filter((r) => r.overdue > -7)) out.push({ text: `${r.doc.number} to ${particulars(data, r.doc)} ${r.overdue > 0 ? `is ${r.overdue} days overdue` : `is due ${fmtDate(r.doc.dueDate)}`}`, sub: `₹ ${money(r.due)} to pay`, tone: r.overdue > 0 ? 'bad' : 'warn', view: { name: 'doc', id: r.doc.id, type: r.doc.type } });
    for (const side of ['purchase', 'sales'] as const) {
      for (const c of cycleColumns(data, eng, side, today)[1].cards) out.push({ text: `${c.doc.number} ${side === 'purchase' ? 'received from' : 'delivered to'} ${particulars(data, c.doc)}, not yet ${side === 'purchase' ? 'billed' : 'invoiced'}`, sub: `₹ ${money(c.value)} · ${c.age} days`, tone: 'warn', view: { name: 'doc', id: c.doc.id, type: c.doc.type } });
    }
    for (const s of stock.filter((s) => s.low)) out.push({ text: `${s.item.name} is at ${s.qty} ${s.item.unit}`, sub: `reorder level ${s.item.reorderLevel}`, tone: 'info', view: { name: 'item', id: s.item.id } });
    return out;
  }, [data, eng]); // eslint-disable-line

  const list = useListNav(attention.length, (i) => nav.go(attention[i].view));
  const recent = [...data.docs].reverse().slice(0, 6);

  return (
    <div>
      <PageHead title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}`} sub={<>Press a letter from the menu to jump, an F-key to create, <Kbd>Ctrl+K</Kbd> to find anything</>} />
      <div className="tiles">
        <Tile label="Cash and bank" value={compact(cash)} onClick={() => nav.go({ name: 'report', report: 'bs' })} />
        <Tile label="To collect" value={compact(sum(recv))} note={`${recv.filter((r) => r.overdue > 0).length} overdue`} tone={recv.some((r) => r.overdue > 0) ? 'bad' : undefined} onClick={() => nav.go({ name: 'report', report: 'receivable' })} />
        <Tile label="To pay" value={compact(sum(pay))} note={`${pay.length} bill${pay.length === 1 ? '' : 's'}`} onClick={() => nav.go({ name: 'report', report: 'payable' })} />
        <Tile label="Stock value" value={compact(stock.reduce((s, r) => s + r.value, 0))} note={`${stock.filter((s) => s.low).length} to reorder`} onClick={() => nav.go({ name: 'report', report: 'stock' })} />
        <Tile label="Sales this year" value={compact(sales)} onClick={() => nav.go({ name: 'report', report: 'pl' })} />
        <Tile label="Gross profit" value={compact(pl.gross)} note={sales ? `${((pl.gross / sales) * 100).toFixed(1)}% margin` : undefined} tone={pl.gross < 0 ? 'bad' : 'good'} onClick={() => nav.go({ name: 'report', report: 'pl' })} />
      </div>
      <div className="dash-cols">
        <section className="card">
          <h4>Needs attention <span className="muted small">↑ ↓ Enter</span></h4>
          <div className="attn" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
            {attention.map((a, i) => {
              const { className, ...rp } = list.rowProps(i);
              return (
                <div key={i} {...rp} className={`attn-row ${className ?? ''}`} onClick={() => nav.go(a.view)}>
                  <span className={`dot ${a.tone}`} />
                  <div><div>{a.text}</div><div className="muted small">{a.sub}</div></div>
                </div>
              );
            })}
            {!attention.length && <div className="muted">All clear.</div>}
          </div>
        </section>
        <section className="card">
          <h4>Recent entries</h4>
          <table className="mini">
            <tbody>
              {recent.map((d) => {
                const s = docStatus(d, eng, today);
                return (
                  <tr key={d.id} onClick={() => nav.go({ name: 'doc', id: d.id, type: d.type })}>
                    <td className="mono">{d.number}</td><td>{particulars(data, d)}</td><td className="num">{money(eng.docValue.get(d.id) ?? 0)}</td><td><Pill tone={s.tone}>{s.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h4 className="section">Keys</h4>
          <div className="keys">
            {CREATE.map((t) => <div key={t}><Kbd>{DOC_META[t].key}</Kbd> {DOC_META[t].label}</div>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile(props: { label: string; value: string; note?: string; tone?: 'bad' | 'good'; onClick: () => void }) {
  return (
    <button className={`tile ${props.tone ?? ''}`} onClick={props.onClick}>
      <span className="tile-label">{props.label}</span>
      <span className="tile-value">{props.value}</span>
      {props.note && <span className="tile-note">{props.note}</span>}
    </button>
  );
}

interface Cmd { id: string; label: string; group: string; hint?: string; run: () => void }

function Palette() {
  const { data, eng } = useStore();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const cmds = useMemo<Cmd[]>(() => [
    ...MENU.flatMap((m) => m.items.map((i) => ({ id: 'm' + i.key, label: i.label, group: 'Go to', hint: `G ${i.key.toUpperCase()}`, run: () => nav.home(i.view.name === 'dashboard' ? undefined : i.view) }))),
    ...CREATE.map((t) => ({ id: 'c' + t, label: `New ${DOC_META[t].label}`, group: 'Create', hint: DOC_META[t].key, run: () => nav.go({ name: 'doc', type: t }) })),
    { id: 'nl', label: 'New ledger', group: 'Create', run: () => nav.go({ name: 'ledgerForm' }) },
    { id: 'ni', label: 'New stock item', group: 'Create', run: () => nav.go({ name: 'itemForm' }) },
    ...data.ledgers.map((l) => ({ id: 'l' + l.id, label: l.name, group: 'Ledger', run: () => nav.go({ name: 'ledger', id: l.id }) })),
    ...data.items.map((i) => ({ id: 'i' + i.id, label: i.name, group: 'Item', hint: i.sku, run: () => nav.go({ name: 'item', id: i.id }) })),
    ...[...data.docs].reverse().map((d) => ({ id: 'd' + d.id, label: `${d.number} ${particulars(data, d) ?? ''}`, group: DOC_META[d.type].label, hint: fmtDate(d.date), run: () => nav.go({ name: 'doc', id: d.id, type: d.type }) })),
    { id: 'reset', label: 'Reset demo company', group: 'Settings', run: () => resetDemo() },
  ], [data, eng]); // eslint-disable-line
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = cmds.filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w))).slice(0, 40);
  useEffect(() => { listRef.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const run = (c?: Cmd) => { if (c) { setPalette(false); c.run(); } };
  return (
    <div className="modal-back palette-back" onMouseDown={() => setPalette(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Type a screen, ledger, item, voucher number…" value={q}
          onChange={(e) => { setQ(e.target.value); setHi(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(shown[hi]); }
            else if (e.key === 'Escape') { e.preventDefault(); setPalette(false); }
          }} />
        <div className="palette-list" ref={listRef}>
          {shown.map((c, i) => (
            <div key={c.id} className={`opt ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={() => run(c)}>
              <span className="opt-label">{c.label}</span>
              <span className="opt-hint">{c.group}{c.hint ? ` · ${c.hint}` : ''}</span>
            </div>
          ))}
          {!shown.length && <div className="opt empty">Nothing matches</div>}
        </div>
      </div>
    </div>
  );
}
