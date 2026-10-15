import { useEffect, useMemo, useRef, useState } from 'react';
import { cycleQueries } from '../api/erpnext';
import { FrappeError } from '../api/frappe';
import { DocType, DOC_META } from '../domain/types';
import { compact, fmtDate, money, qty, todayISO } from '../format';
import { DateInput, focusNext, Kbd, Modal, NumInput, Option, PageHead, Pill, Picker, TextInput, useListNav } from '../ui/common';
import {
  api, blankDoc, boot, createNext, dateField, dayBook, deskUrl, DocRow, ErpLine, erpNav, erpState, erpToast, ErpView, finalize, invalidate,
  isPurchase, ITEM_TYPES, ItemType, linkedDocs, loadMasters, Masters, partyField, setErpPalette, typeOfDoctype, useErp,
} from './model';
import { DOCTYPE } from '../api/erpnext';
import { ReportScreen } from './Reports';

type Tone = 'neutral' | 'info' | 'warn' | 'good' | 'bad';

/** Small fetch hook that refetches when deps or the global version change. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const { version } = useErp();
  const [res, setRes] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setRes((r) => ({ ...r, loading: true }));
    fn().then((data) => live && setRes({ data, loading: false }), (e) => live && setRes({ error: (e as Error).message, loading: false }));
    return () => { live = false; };
  }, [version, ...deps]); // eslint-disable-line
  return res;
}

const statusTone = (s: string): Tone =>
  /cancel/i.test(s) ? 'bad' : /overdue/i.test(s) ? 'bad' : /^(paid|completed|closed|submitted)$/i.test(s) ? 'good'
    : /to (receive|deliver)|partly|part/i.test(s) ? 'warn' : /unpaid|to bill|to pay/i.test(s) ? 'info' : 'neutral';

interface MenuItem { key: string; label: string; view?: ErpView; href?: string }
const MENU: { title: string; items: MenuItem[] }[] = [
  { title: 'Work', items: [
    { key: 'h', label: 'Home', view: { name: 'home' } },
    { key: 'd', label: 'Day Book', view: { name: 'list' } },
    { key: 'u', label: 'Purchase cycle', view: { name: 'cycle', side: 'purchase' } },
    { key: 's', label: 'Sales cycle', view: { name: 'cycle', side: 'sales' } },
    { key: 'k', label: 'Stock Summary', view: { name: 'stock' } },
  ] },
  { title: 'Reports', items: [
    { key: 'r', label: 'Receivables', view: { name: 'report', key: 'receivable' } },
    { key: 'y', label: 'Payables', view: { name: 'report', key: 'payable' } },
    { key: 't', label: 'Trial Balance', view: { name: 'report', key: 'tb' } },
    { key: 'p', label: 'Profit & Loss', view: { name: 'report', key: 'pl' } },
    { key: 'b', label: 'Balance Sheet', view: { name: 'report', key: 'bs' } },
  ] },
];
const CREATE: DocType[] = ['PBILL', 'SINV', 'PO', 'SO', 'GRN', 'DN'];
const DESK_CREATE: { type: DocType; doctype: string }[] = [
  { type: 'PAY', doctype: 'Payment Entry' }, { type: 'RCPT', doctype: 'Payment Entry' }, { type: 'JRNL', doctype: 'Journal Entry' }, { type: 'CONTRA', doctype: 'Journal Entry' },
];

function keyToDocType(e: KeyboardEvent): DocType | undefined {
  const sig = `${e.shiftKey ? 'Shift+' : ''}${e.altKey ? 'Alt+' : ''}${e.key}`;
  return (Object.keys(DOC_META) as DocType[]).find((t) => DOC_META[t].key === sig);
}
function openCreate(t: DocType) {
  if ((ITEM_TYPES as readonly string[]).includes(t)) erpNav.go({ name: 'new', type: t });
  else location.href = deskUrl(DESK_CREATE.find((d) => d.type === t)!.doctype);
}
const go = (it: MenuItem) => (it.href ? (location.href = it.href) : erpNav.home(it.view!.name === 'home' ? undefined : it.view));

export function ErpApp() {
  const st = useErp();
  const view = st.nav[st.nav.length - 1];
  const [menuOpen, setMenuOpen] = useState(false);
  const gPending = useRef(0);
  useEffect(() => { loadMasters(); }, []);
  useEffect(() => setMenuOpen(false), [view]);

  useEffect(() => {
    const capture = (e: KeyboardEvent) => {
      const t = keyToDocType(e);
      if (t) { e.preventDefault(); e.stopPropagation(); openCreate(t); return; }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.altKey && e.key.toLowerCase() === 'g')) { e.preventDefault(); e.stopPropagation(); setErpPalette(!erpState().palette); return; }
      if (Date.now() - gPending.current < 1500 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        gPending.current = 0;
        const it = MENU.flatMap((m) => m.items).find((i) => i.key === e.key.toLowerCase());
        if (it) { e.preventDefault(); e.stopPropagation(); go(it); }
      }
    };
    const bubble = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') { if (erpState().palette) setErpPalette(false); else if (!document.querySelector('.modal')) erpNav.back(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || erpState().palette) return;
      if ((e.target as HTMLElement).closest('input,textarea,select,.modal')) return;
      const k = e.key.toLowerCase();
      if (erpState().nav.at(-1)!.name === 'home') {
        const it = MENU.flatMap((m) => m.items).find((i) => i.key === k && i.key !== 'h');
        if (it) { e.preventDefault(); go(it); return; }
      }
      if (k === 'g') { gPending.current = Date.now(); e.preventDefault(); }
    };
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keydown', bubble);
    return () => { window.removeEventListener('keydown', capture, true); window.removeEventListener('keydown', bubble); };
  }, []);

  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span className="logo">ƒ</span> Fluid ERP</div>
        <div className="company">{st.masters?.company ?? 'Loading…'}<small>{boot().user}</small></div>
        {MENU.map((sec) => (
          <nav key={sec.title}>
            <h5>{sec.title}</h5>
            {sec.items.map((it) => (
              <button key={it.key} className={it.view && JSON.stringify(view) === JSON.stringify(it.view) ? 'on' : ''} onClick={() => go(it)}>
                <span>{it.label}</span><Kbd>{view.name === 'home' ? it.key.toUpperCase() : `G ${it.key.toUpperCase()}`}</Kbd>
              </button>
            ))}
          </nav>
        ))}
        <nav>
          <h5>Create</h5>
          {CREATE.map((t) => <button key={t} onClick={() => openCreate(t)}><span>{DOC_META[t].label}</span><Kbd>{DOC_META[t].key}</Kbd></button>)}
          {DESK_CREATE.map((d) => <button key={d.type} onClick={() => openCreate(d.type)}><span>{DOC_META[d.type].label} ↗</span><Kbd>{DOC_META[d.type].key}</Kbd></button>)}
        </nav>
        <nav><h5>ERPNext</h5><button onClick={() => (location.href = '/app')}><span>Open ERPNext desk ↗</span></button></nav>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">☰</button>
          {st.nav.length > 1 && <button className="back" onClick={() => erpNav.back()}><Kbd>Esc</Kbd> Back</button>}
          <button className="search-btn" onClick={() => setErpPalette(true)}>Go to anything… <Kbd>Ctrl+K</Kbd></button>
          <div className="spacer" />
          <span className="today">{fmtDate(todayISO())}</span>
        </header>
        <main>
          {st.error && <div className="errors">Could not load data from ERPNext: {st.error}</div>}
          {!st.masters && !st.error ? <div className="muted">Loading your company data…</div> : st.masters && <Screen view={view} m={st.masters} />}
        </main>
      </div>
      {st.palette && st.masters && <Palette m={st.masters} />}
      {st.toast && <div key={st.toast.at} className={`toast ${st.toast.tone}`}>{st.toast.text}</div>}
    </div>
  );
}

function Screen({ view, m }: { view: ErpView; m: Masters }) {
  switch (view.name) {
    case 'home': return <Home m={m} />;
    case 'list': return <DayBook filter={view.filter} />;
    case 'cycle': return <Cycle key={view.side} side={view.side} />;
    case 'doc': return <DocView key={view.id} type={view.type} id={view.id} />;
    case 'new': return <NewDoc key={JSON.stringify(view.draft ?? view.type)} type={view.type} draft={view.draft} m={m} />;
    case 'stock': return <Stock m={m} />;
    case 'report': return <ReportScreen key={view.key + (view.account ?? '')} rkey={view.key} account={view.account} />;
  }
}

const openRow = (r: { doctype: string; name: string; type?: DocType; status?: string }) =>
  erpNav.go({ name: 'doc', type: r.type ?? typeOfDoctype(r.doctype, r.status) ?? 'PAY', id: r.name });

function Home({ m }: { m: Masters }) {
  const purchase = useLoad(() => cycleTotals('purchase'), []);
  const sales = useLoad(() => cycleTotals('sales'), []);
  const low = m.items.filter((i) => (m.bins.get(i.name)?.actual ?? 0) <= 0).length;
  return (
    <div>
      <PageHead title="Home" sub={<>Press a letter from the menu to jump, an F-key to create, <Kbd>Ctrl+K</Kbd> to find anything</>} />
      <div className="tiles">
        {[...(purchase.data ?? []), ...(sales.data ?? [])].map((c) => (
          <button key={c.title} className="tile" onClick={() => erpNav.go({ name: 'cycle', side: c.side })}>
            <span className="tile-label">{c.title}</span><span className="tile-value">{compact(c.total)}</span><span className="tile-note">{c.count} documents</span>
          </button>
        ))}
        <button className="tile" onClick={() => erpNav.go({ name: 'stock' })}><span className="tile-label">Items out of stock</span><span className="tile-value">{low}</span><span className="tile-note">of {m.items.length} stock items</span></button>
      </div>
      {(purchase.error || sales.error) && <div className="errors">{purchase.error ?? sales.error}</div>}
      <div className="card"><h4>Keys</h4><div className="keys">{(Object.keys(DOC_META) as DocType[]).map((t) => <div key={t}><Kbd>{DOC_META[t].key}</Kbd> {DOC_META[t].label}</div>)}</div></div>
    </div>
  );
}

async function cycleTotals(side: 'purchase' | 'sales') {
  const qs = cycleQueries(side);
  return Promise.all(qs.map(async (q) => {
    const totalField = q.fields.includes('outstanding_amount') ? 'outstanding_amount' : 'grand_total';
    const rows = await api.getList<Record<string, number>>(q.doctype, { fields: [totalField], filters: q.filters, limit: 1000 });
    return { side, title: q.title, count: rows.length, total: rows.reduce((s, r) => s + Number(r[totalField] ?? 0), 0) };
  }));
}

function DayBook({ filter }: { filter?: DocType }) {
  const [f, setF] = useState<DocType | undefined>(filter);
  const res = useLoad(() => dayBook(f), [f]);
  const rows = res.data ?? [];
  const chips: (DocType | undefined)[] = [undefined, 'PO', 'GRN', 'PBILL', 'SO', 'DN', 'SINV', 'PAY', 'RCPT'];
  const list = useListNav(rows.length, (i) => openRow(rows[i]), {
    onKey: (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const i = chips.indexOf(f); setF(chips[(i + (e.key === 'ArrowRight' ? 1 : chips.length - 1)) % chips.length]); return true; }
      if (e.key.toLowerCase() === 'n' && f) { openCreate(f); return true; }
      return false;
    },
  });
  return (
    <div>
      <PageHead title="Day Book" sub={<><Kbd>←</Kbd><Kbd>→</Kbd> switch type · <Kbd>Enter</Kbd> open{f && <> · <Kbd>N</Kbd> new {DOC_META[f].label}</>}</>} />
      <div className="chips">{chips.map((c) => <button key={c ?? 'all'} className={c === f ? 'chip on' : 'chip'} onClick={() => setF(c)}>{c ? DOC_META[c].short : 'All'}</button>)}</div>
      {res.error && <div className="errors">{res.error}</div>}
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid list">
          <thead><tr><th className="w-date">Date</th><th>Number</th><th>Type</th><th>Party</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.doctype + r.name} {...list.rowProps(i)}>
                <td>{fmtDate(r.date)}</td><td className="mono">{r.name}</td><td>{DOC_META[r.type]?.label ?? r.doctype}</td><td>{r.party}</td>
                <td className="num">{money(r.total)}</td><td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted empty-row">{res.loading ? 'Loading…' : 'Nothing here yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cycle({ side }: { side: 'purchase' | 'sales' }) {
  const qs = cycleQueries(side);
  const res = useLoad(() => Promise.all(qs.map((q) => api.getList<Record<string, unknown>>(q.doctype, { fields: q.fields, filters: q.filters, orderBy: 'creation asc', limit: 200 }).then((rows) => ({ q, rows })))), [side]);
  const cols = res.data ?? [];
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [side]);
  const party = partyField(side === 'purchase' ? 'PO' : 'SO');
  const onKeyDown = (e: React.KeyboardEvent) => {
    let [c, r] = pos;
    if (e.key === 'ArrowRight') c = Math.min(cols.length - 1, c + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowDown') r += 1;
    else if (e.key === 'ArrowUp') r -= 1;
    else if (e.key === 'Enter') { const row = cols[c]?.rows[r]; if (row) openRow({ doctype: cols[c].q.doctype, name: String(row.name) }); e.preventDefault(); return; }
    else if (e.key === 'Tab') { e.preventDefault(); erpNav.replace({ name: 'cycle', side: side === 'purchase' ? 'sales' : 'purchase' }); return; }
    else return;
    e.preventDefault();
    setPos([c, Math.max(0, Math.min((cols[c]?.rows.length ?? 1) - 1, r))]);
  };
  const today = todayISO();
  return (
    <div>
      <PageHead title={side === 'purchase' ? 'Purchase cycle' : 'Sales cycle'} sub={<>Live from ERPNext · <Kbd>←</Kbd><Kbd>→</Kbd><Kbd>↑</Kbd><Kbd>↓</Kbd> move · <Kbd>Enter</Kbd> open · <Kbd>Tab</Kbd> switch</>} />
      {res.error && <div className="errors">{res.error}</div>}
      <div className="board" style={{ gridTemplateColumns: `repeat(${qs.length}, minmax(220px, 1fr))` }} tabIndex={0} ref={ref} onKeyDown={onKeyDown}>
        {(cols.length ? cols : qs.map((q) => ({ q, rows: [] as Record<string, unknown>[] }))).map(({ q, rows }, ci) => {
          const val = (r: Record<string, unknown>) => Number(r.outstanding_amount ?? r.grand_total ?? 0);
          return (
            <div className="col" key={q.title}>
              <div className="col-head"><div>{q.title}</div><div className="col-total">{compact(rows.reduce((s, r) => s + val(r), 0))} <span className="muted">· {rows.length}</span></div></div>
              {rows.map((r, ri) => {
                const due = r.due_date ? String(r.due_date) : undefined;
                const late = due && due < today;
                const pct = r.per_received ?? r.per_delivered ?? r.per_billed;
                return (
                  <div key={String(r.name)} className={`kcard ${late ? 'bad' : ''} ${pos[0] === ci && pos[1] === ri ? 'sel' : ''}`} onClick={() => setPos([ci, ri])} onDoubleClick={() => openRow({ doctype: q.doctype, name: String(r.name) })}>
                    <div className="kc-top"><span className="mono">{String(r.name)}</span><span>₹ {money(val(r))}</span></div>
                    <div className="kc-party">{String(r[party] ?? '')}</div>
                    <div className="kc-meta muted small">{fmtDate(String(r.transaction_date ?? r.posting_date))}{pct !== undefined ? ` · ${Math.round(Number(pct))}% done` : ''}{due ? ` · due ${fmtDate(due)}` : ''}</div>
                  </div>
                );
              })}
              {!rows.length && <div className="muted small empty-col">{res.loading ? 'Loading…' : 'Nothing here'}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const NEXT: Partial<Record<DocType, { key: string; label: string; target: DocType; when: (d: Record<string, unknown>) => boolean }[]>> = {
  PO: [{ key: 'r', label: 'Receive goods', target: 'GRN', when: (d) => Number(d.per_received) < 100 }, { key: 'b', label: 'Enter bill', target: 'PBILL', when: (d) => Number(d.per_billed) < 100 }],
  GRN: [{ key: 'b', label: 'Enter bill', target: 'PBILL', when: (d) => Number(d.per_billed) < 100 }],
  SO: [{ key: 'd', label: 'Deliver', target: 'DN', when: (d) => Number(d.per_delivered) < 100 }, { key: 'i', label: 'Invoice', target: 'SINV', when: (d) => Number(d.per_billed) < 100 }],
  DN: [{ key: 'i', label: 'Invoice', target: 'SINV', when: (d) => Number(d.per_billed) < 100 }],
  PBILL: [{ key: 'p', label: 'Make payment', target: 'PAY', when: (d) => Number(d.outstanding_amount) > 0 }],
  SINV: [{ key: 'p', label: 'Record receipt', target: 'RCPT', when: (d) => Number(d.outstanding_amount) > 0 }],
};

function DocView({ type, id }: { type: DocType; id: string }) {
  const doctype = DOCTYPE[type];
  const res = useLoad(() => api.getDoc<Record<string, unknown>>(doctype, id), [doctype, id]);
  const d = res.data;
  const links = useLoad(() => (d ? linkedDocs(type, d) : Promise.resolve([])), [d]);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const actions = d && Number(d.docstatus) === 1 ? (NEXT[type] ?? []).filter((a) => a.when(d)) : [];
  const run = async (target: DocType) => {
    setBusy(true);
    try { await createNext(type, id, target); } catch (e) { erpToast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || erpState().palette || cancelling || busy) return;
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      const k = e.key.toLowerCase();
      const a = actions.find((x) => x.key === k);
      if (a) { e.preventDefault(); run(a.target); }
      else if (k === 'x' && d && Number(d.docstatus) === 1) { e.preventDefault(); setCancelling(true); }
      else if (k === 'o') { e.preventDefault(); location.href = deskUrl(doctype, id); }
      else if (/^[1-9]$/.test(k) && links.data?.[Number(k) - 1]) { e.preventDefault(); openRow(links.data[Number(k) - 1]); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  if (res.error) return <div className="errors">{res.error}</div>;
  if (!d) return <div className="muted">Loading {id}…</div>;
  const status = Number(d.docstatus) === 2 ? 'Cancelled' : String(d.status ?? (Number(d.docstatus) === 0 ? 'Draft' : 'Submitted'));
  const items = (d.items as Record<string, unknown>[]) ?? [];
  const isPay = doctype === 'Payment Entry';
  return (
    <div className="docform ro">
      <PageHead title={<>{DOC_META[type].label} <span className="docno">{id}</span> <Pill tone={statusTone(status)}>{status}</Pill></>}
        sub={<>{fmtDate(String(d[isPay ? 'posting_date' : dateField(type)] ?? ''))} · {String(d[isPay ? 'party' : partyField(type)] ?? '')}</>}>
        {actions.map((a) => <button key={a.key} className="primary" disabled={busy} onClick={() => run(a.target)}><Kbd>{a.key.toUpperCase()}</Kbd> {a.label}</button>)}
        <button onClick={() => (location.href = deskUrl(doctype, id))}><Kbd>O</Kbd> Open in ERPNext</button>
        {Number(d.docstatus) === 1 && <button className="danger" onClick={() => setCancelling(true)}><Kbd>X</Kbd> Cancel</button>}
      </PageHead>
      <div className="doc-layout">
        <div className="doc-main card">
          {isPay ? (
            <table className="grid"><tbody>
              <tr><td>Paid from</td><td>{String(d.paid_from ?? '')}</td></tr>
              <tr><td>Paid to</td><td>{String(d.paid_to ?? '')}</td></tr>
              <tr><td>Reference</td><td>{String(d.reference_no ?? '')} {d.reference_date ? fmtDate(String(d.reference_date)) : ''}</td></tr>
              {((d.references as Record<string, unknown>[]) ?? []).map((r, i) => <tr key={i}><td>Against {String(r.reference_name)}</td><td className="num">{money(Number(r.allocated_amount))}</td></tr>)}
            </tbody></table>
          ) : (
            <table className="grid lines">
              <thead><tr><th className="c-no">#</th><th>Item</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
              <tbody>{items.map((l, i) => <tr key={i}><td className="c-no muted">{i + 1}</td><td>{String(l.item_name ?? l.item_code)}</td><td className="num">{qty(Number(l.qty))}</td><td className="muted">{String(l.uom ?? '')}</td><td className="num">{money(Number(l.rate))}</td><td className="num">{money(Number(l.amount))}</td></tr>)}</tbody>
            </table>
          )}
          <div className="doc-foot">
            <div className="grow muted">{String(d.remarks ?? '')}</div>
            <div className="doc-total"><span>{d.outstanding_amount !== undefined ? `Outstanding ₹ ${money(Number(d.outstanding_amount))}` : 'Total'}</span><strong>₹ {money(Number(d.grand_total ?? d.paid_amount ?? 0))}</strong></div>
          </div>
        </div>
        <aside className="doc-side">
          <div className="card">
            <h4>Progress</h4>
            {['per_received', 'per_delivered', 'per_billed'].filter((f) => d[f] !== undefined).map((f) => (
              <div key={f} className="small" style={{ margin: '4px 0' }}>{f.replace('per_', '').replace(/^./, (c) => c.toUpperCase())}: <strong>{Math.round(Number(d[f]))}%</strong></div>
            ))}
            {d.due_date ? <div className="small">Due {fmtDate(String(d.due_date))}</div> : null}
          </div>
          {!!links.data?.length && (
            <div className="card">
              <h4>Document flow</h4>
              <ol className="chain">
                {links.data.map((l, i) => (
                  <li key={l.doctype + l.name} onClick={() => openRow(l)}>
                    <Kbd>{i + 1}</Kbd><div><div><strong>{l.name}</strong></div><div className="muted small">{l.doctype}</div></div><span />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
      {cancelling && (
        <Modal title={`Cancel ${id}?`} onClose={() => setCancelling(false)}>
          <p className="muted">ERPNext reverses its ledger and stock entries and keeps the document, marked cancelled. Documents made from it must be cancelled first.</p>
          <div className="modal-actions">
            <button autoFocus className="danger" onClick={async () => {
              try { await api.cancel(doctype, id); erpToast(`${id} cancelled`); invalidate(); setCancelling(false); } catch (e) { erpToast((e as Error).message, 'bad'); }
            }}>Cancel document</button>
            <button onClick={() => setCancelling(false)}>Keep</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewDoc({ type, draft, m }: { type: DocType; draft?: Record<string, unknown>; m: Masters }) {
  if (type === 'PAY' || type === 'RCPT') return <PaymentForm type={type} draft={draft!} />;
  return <ItemDocForm type={type as ItemType} draft={draft} m={m} />;
}

function ItemDocForm({ type, draft, m }: { type: ItemType; draft?: Record<string, unknown>; m: Masters }) {
  const [doc, setDoc] = useState<Record<string, unknown>>(() => draft ?? blankDoc(type, m));
  const [errors, setErrors] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const purchase = isPurchase(type);
  const pf = partyField(type);
  const df = dateField(type);
  const lines = (doc.items as ErpLine[]) ?? [];
  const update = (p: Record<string, unknown>) => setDoc((d) => ({ ...d, ...p }));
  const setLine = (i: number, p: Partial<ErpLine>) => update({ items: lines.map((l, j) => (j === i ? { ...l, ...p, amount: undefined } : l)) });

  const partyOpts: Option[] = useMemo(() => (purchase ? m.suppliers.map((s) => ({ id: s.name, label: s.supplier_name || s.name, sub: s.name !== s.supplier_name ? s.name : undefined }))
    : m.customers.map((c) => ({ id: c.name, label: c.customer_name || c.name, sub: c.name !== c.customer_name ? c.name : undefined }))), [m, purchase]);
  const itemOpts: Option[] = useMemo(() => m.items.map((i) => {
    const b = m.bins.get(i.name);
    return { id: i.name, label: i.item_name || i.name, sub: i.name !== i.item_name ? i.name : undefined, hint: `${qty(b?.actual ?? 0)} ${i.stock_uom}${b?.ordered ? ` · +${qty(b.ordered)} on order` : ''}${b?.reserved ? ` · ${qty(b.reserved)} reserved` : ''}` };
  }), [m]);
  const whOpts: Option[] = useMemo(() => m.warehouses.map((w) => ({ id: w.name, label: w.name })), [m]);
  const addLine = (code: string) => {
    const it = m.items.find((x) => x.name === code)!;
    const rate = purchase ? it.last_purchase_rate || it.valuation_rate || 0 : it.standard_rate || 0;
    update({ items: [...lines, { item_code: code, item_name: it.item_name, qty: 0, rate, uom: it.stock_uom, stock_uom: it.stock_uom, conversion_factor: 1 }] });
  };
  const total = lines.reduce((s, l) => s + (l.qty || 0) * (l.rate || 0), 0);

  const save = async () => {
    if (saving) return;
    setSaving(true); setErrors('');
    try {
      const res = await api.post<{ name: string }>(finalize(type, doc) as unknown as { doctype: string });
      erpToast(`${DOC_META[type].label} ${res.name} saved in ERPNext`);
      invalidate();
      erpNav.replace({ name: 'doc', type, id: res.name });
    } catch (e) {
      setErrors(e instanceof FrappeError ? e.message : String(e));
    } finally { setSaving(false); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['enter', 'a', 's'].includes(e.key.toLowerCase()) && !document.querySelector('.modal, .palette')) { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  useEffect(() => {
    const root = formRef.current;
    if (!root || root.contains(document.activeElement)) return;
    const first = (lines.length ? root?.querySelector('table.lines input.num') : root?.querySelector('[data-nav]')) as HTMLInputElement | null;
    first?.focus(); first?.select?.();
  }, []); // eslint-disable-line
  const narration = () => (formRef.current?.querySelector('textarea') as HTMLElement | null)?.focus();
  const rows: (ErpLine | null)[] = [...lines, null];
  const extraDate = type === 'PO' ? 'schedule_date' : type === 'SO' ? 'delivery_date' : type === 'PBILL' || type === 'SINV' ? 'due_date' : undefined;

  return (
    <div className="docform" data-form ref={formRef}>
      <PageHead title={<>{DOC_META[type].label} <span className="docno">New</span></>} sub={<>Saves straight into ERPNext · Enter moves on · <Kbd>Ctrl+Enter</Kbd> saves · <Kbd>Esc</Kbd> back</>}>
        <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'} <Kbd>Ctrl+Enter</Kbd></button>
      </PageHead>
      {errors && <div className="errors" style={{ whiteSpace: 'pre-line' }}>{errors}</div>}
      <div className="card">
        <div className="fields">
          <label className="field w-date"><span>Date</span><DateInput value={String(doc[df])} onChange={(v) => update({ [df]: v })} /></label>
          <label className="field grow"><span>{purchase ? 'Supplier' : 'Customer'}</span>
            <Picker autoFocus={!doc[pf]} value={doc[pf] as string | undefined} options={partyOpts} placeholder="Type to search" onChange={(v) => update({ [pf]: v })} /></label>
          {extraDate && <label className="field w-date"><span>{extraDate === 'due_date' ? 'Due date' : extraDate === 'schedule_date' ? 'Required by' : 'Deliver by'}</span><DateInput value={String(doc[extraDate] ?? doc[df])} onChange={(v) => update({ [extraDate]: v })} /></label>}
          <label className="field grow"><span>Warehouse</span><Picker value={doc.set_warehouse as string | undefined} options={whOpts} onChange={(v) => update({ set_warehouse: v })} /></label>
        </div>
        <table className="grid lines">
          <thead><tr><th className="c-no">#</th><th>Item</th><th className="num w-qty">Qty</th><th className="w-unit">Unit</th><th className="num w-rate">Rate</th><th className="num w-amt">Amount</th><th className="w-x" /></tr></thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i} onKeyDown={(e) => { if (l && e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); update({ items: lines.filter((_, j) => j !== i) }); } }}>
                <td className="c-no muted">{l ? i + 1 : ''}</td>
                <td><Picker value={l?.item_code} options={itemOpts} placeholder={lines.length ? 'Next item, or Enter to finish' : 'Type an item name'} onChange={(v) => (l ? setLine(i, { item_code: v }) : addLine(v))} onEmptyEnter={l ? undefined : narration} /></td>
                <td>{l && <NumInput value={l.qty} onChange={(n) => setLine(i, { qty: n })} />}</td>
                <td className="muted">{l?.uom}</td>
                <td>{l && <NumInput value={l.rate} onChange={(n) => setLine(i, { rate: n })} />}</td>
                <td className="num">{l ? money((l.qty || 0) * (l.rate || 0)) : ''}</td>
                <td>{l && <button className="icon" tabIndex={-1} onClick={() => update({ items: lines.filter((_, j) => j !== i) })}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="doc-foot">
          <label className="field grow"><span>Remarks</span><TextInput multiline value={String(doc.remarks ?? '')} onChange={(v) => update({ remarks: v })} /></label>
          <div className="doc-total"><span>Total before taxes</span><strong>₹ {money(total)}</strong></div>
        </div>
        <div className="save-row"><button className="primary" data-nav onClick={save} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}>{saving ? 'Saving…' : 'Accept and save'}</button><span className="muted">ERPNext checks the entry and posts it</span></div>
      </div>
    </div>
  );
}

function PaymentForm({ type, draft }: { type: DocType; draft: Record<string, unknown> }) {
  const refs = (draft.references as Record<string, unknown>[]) ?? [];
  const outstanding = refs.reduce((s, r) => s + Number(r.outstanding_amount ?? 0), 0);
  const [amount, setAmount] = useState(Number(draft.paid_amount ?? outstanding));
  const [date, setDate] = useState(todayISO());
  const [refNo, setRefNo] = useState('');
  const [errors, setErrors] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true); setErrors('');
    let left = amount;
    const references = refs.map((r) => { const a = Math.min(left, Number(r.outstanding_amount ?? 0)); left -= a; return { ...r, allocated_amount: a }; });
    try {
      const res = await api.post<{ name: string }>({ ...draft, doctype: 'Payment Entry', posting_date: date, paid_amount: amount, received_amount: amount, reference_no: refNo || undefined, reference_date: refNo ? date : undefined, references } as { doctype: string });
      erpToast(`${DOC_META[type].label} ${res.name} saved in ERPNext`);
      invalidate();
      erpNav.replace({ name: 'doc', type, id: res.name });
    } catch (e) { setErrors((e as Error).message); } finally { setSaving(false); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ['enter', 'a', 's'].includes(e.key.toLowerCase())) { e.preventDefault(); save(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  return (
    <div className="docform" data-form>
      <PageHead title={<>{DOC_META[type].label} <span className="docno">New</span></>} sub={<>{String(draft.party ?? '')} · against {refs.map((r) => String(r.reference_name)).join(', ')} · <Kbd>Ctrl+Enter</Kbd> saves</>}>
        <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'} <Kbd>Ctrl+Enter</Kbd></button>
      </PageHead>
      {errors && <div className="errors" style={{ whiteSpace: 'pre-line' }}>{errors}</div>}
      <div className="card">
        <div className="fields">
          <label className="field w-date"><span>Date</span><DateInput autoFocus value={date} onChange={setDate} /></label>
          <label className="field w-amt"><span>Amount</span><NumInput value={amount} onChange={setAmount} /></label>
          <label className="field grow"><span>Cheque / UTR no.</span><TextInput value={refNo} onChange={setRefNo} placeholder="Needed for bank payments" /></label>
        </div>
        <div className="party-info">
          <span>{type === 'PAY' ? 'Paid from' : 'Deposited into'} <strong>{String(type === 'PAY' ? draft.paid_from : draft.paid_to)}</strong></span>
          <span>Pending on bill <strong>₹ {money(outstanding)}</strong></span>
          {amount < outstanding && <span>Part payment; ₹ {money(outstanding - amount)} stays due</span>}
        </div>
        <div className="save-row"><button className="primary" data-nav onClick={save} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Tab') focusNext(e.currentTarget, 1); }}>{saving ? 'Saving…' : 'Accept and save'}</button><span className="muted">Change bank account or other details in ERPNext if needed</span></div>
      </div>
    </div>
  );
}

function Stock({ m }: { m: Masters }) {
  const rows = m.items.map((i) => ({ i, b: m.bins.get(i.name) ?? { actual: 0, ordered: 0, reserved: 0 } }));
  const list = useListNav(rows.length, (k) => (location.href = `/app/query-report/Stock Ledger?item_code=${encodeURIComponent(rows[k].i.name)}`));
  return (
    <div>
      <PageHead title="Stock Summary" sub={<>All warehouses · <Kbd>Enter</Kbd> opens the item's stock ledger in ERPNext</>}>
        <button onClick={() => { loadMasters(); erpToast('Refreshed'); }}>Refresh</button>
      </PageHead>
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid list">
          <thead><tr><th>Item</th><th>Unit</th><th className="num">In stock</th><th className="num">On order</th><th className="num">Reserved for customers</th><th className="num">Available</th></tr></thead>
          <tbody>{rows.map(({ i, b }, k) => (
            <tr key={i.name} {...list.rowProps(k)}>
              <td>{i.item_name} <span className="muted small">{i.name !== i.item_name ? i.name : ''}</span> {b.actual <= 0 && <Pill tone="warn">Out of stock</Pill>}</td>
              <td className="muted">{i.stock_uom}</td><td className="num"><strong>{qty(b.actual)}</strong></td><td className="num muted">{b.ordered ? qty(b.ordered) : ''}</td>
              <td className="num muted">{b.reserved ? qty(b.reserved) : ''}</td><td className="num">{qty(b.actual + b.ordered - b.reserved)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Palette({ m }: { m: Masters }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [found, setFound] = useState<DocRow[]>([]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setFound([]); return; }
    const timer = setTimeout(async () => {
      const hits = await Promise.all(ITEM_TYPES.map((ty) => api.getList<{ name: string }>(DOCTYPE[ty], { fields: ['name'], filters: [['name', 'like', `%${t}%`]], limit: 5 })
        .then((rows) => rows.map((r) => ({ name: r.name, doctype: DOCTYPE[ty], type: ty as DocType, date: '', party: '', total: 0, status: '', docstatus: 1 }))).catch(() => [])));
      setFound(hits.flat());
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const cmds = [
    ...MENU.flatMap((s) => s.items.map((i) => ({ id: 'm' + i.key, label: i.label, group: 'Go to', run: () => go(i) }))),
    ...[...CREATE, ...DESK_CREATE.map((d) => d.type)].map((t) => ({ id: 'c' + t, label: `New ${DOC_META[t].label}`, group: DOC_META[t].key, run: () => openCreate(t) })),
    ...found.map((r) => ({ id: 'd' + r.name, label: r.name, group: r.doctype, run: () => openRow(r) })),
    ...m.suppliers.map((s) => ({ id: 's' + s.name, label: s.supplier_name, group: 'Supplier', run: () => (location.href = deskUrl('Supplier', s.name)) })),
    ...m.customers.map((c) => ({ id: 'u' + c.name, label: c.customer_name, group: 'Customer', run: () => (location.href = deskUrl('Customer', c.name)) })),
  ];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = cmds.filter((c) => c.id.startsWith('d') || words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w))).slice(0, 40);
  const run = (c?: (typeof cmds)[number]) => { if (c) { setErpPalette(false); c.run(); } };
  return (
    <div className="modal-back palette-back" onMouseDown={() => setErpPalette(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Type a screen, party or document number…" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(shown[hi]); }
            else if (e.key === 'Escape') { e.preventDefault(); setErpPalette(false); }
          }} />
        <div className="palette-list">
          {shown.map((c, i) => <div key={c.id} className={`opt ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={() => run(c)}><span className="opt-label">{c.label}</span><span className="opt-hint">{c.group}</span></div>)}
          {!shown.length && <div className="opt empty">Nothing matches</div>}
        </div>
      </div>
    </div>
  );
}
