import { useEffect, useMemo, useState } from 'react';
import { DocType } from '../domain/types';
import { fmtDate, money, qty, todayISO } from '../format';
import { Kbd, PageHead, useListNav } from '../ui/common';
import { api, deskUrl, erpNav, ITEM_TYPES, typeOfDoctype, useErp } from './model';

export type ReportKey = 'tb' | 'pl' | 'bs' | 'receivable' | 'payable' | 'gl';

interface Col { fieldname: string; label: string; fieldtype: string }
type Row = Record<string, unknown>;
interface Ctx { company: string; fy: { name: string; start: string; end: string }; today: string; account?: string }

interface Def { title: string; report: string; filters: (c: Ctx) => Record<string, unknown>; pick?: string[]; tree?: boolean; sub: (c: Ctx) => string }

/** ERPNext's own reports, run through frappe.desk.query_report.run and drawn in Fluid. */
const DEFS: Record<ReportKey, Def> = {
  tb: {
    title: 'Trial Balance', report: 'Trial Balance', tree: true,
    filters: (c) => ({ company: c.company, fiscal_year: c.fy.name, from_date: c.fy.start, to_date: c.today, show_zero_values: 0, with_period_closing_entry_for_current_period: 1 }),
    pick: ['account', 'opening_debit', 'opening_credit', 'debit', 'credit', 'closing_debit', 'closing_credit'],
    sub: (c) => `${fmtDate(c.fy.start)} to ${fmtDate(c.today)}`,
  },
  pl: {
    title: 'Profit & Loss', report: 'Profit and Loss Statement', tree: true,
    filters: (c) => statementFilters(c), sub: (c) => `${fmtDate(c.fy.start)} to ${fmtDate(c.today)}`,
  },
  bs: {
    title: 'Balance Sheet', report: 'Balance Sheet', tree: true,
    filters: (c) => statementFilters(c), sub: (c) => `as on ${fmtDate(c.today)}`,
  },
  receivable: {
    title: 'Receivables', report: 'Accounts Receivable',
    filters: (c) => ageingFilters(c, 'Customer'), pick: AGEING_COLS(), sub: (c) => `Bill-wise outstanding as on ${fmtDate(c.today)}, aged by due date`,
  },
  payable: {
    title: 'Payables', report: 'Accounts Payable',
    filters: (c) => ageingFilters(c, 'Supplier'), pick: AGEING_COLS(), sub: (c) => `Bill-wise outstanding as on ${fmtDate(c.today)}, aged by due date`,
  },
  gl: {
    title: 'Ledger', report: 'General Ledger',
    filters: (c) => ({ company: c.company, from_date: c.fy.start, to_date: c.today, account: c.account ? [c.account] : undefined, categorize_by: 'Categorize by Voucher (Consolidated)', group_by: 'Group by Voucher (Consolidated)', include_dimensions: 0 }),
    pick: ['posting_date', 'account', 'debit', 'credit', 'balance', 'voucher_type', 'voucher_no', 'against', 'party', 'remarks'],
    sub: (c) => `${fmtDate(c.fy.start)} to ${fmtDate(c.today)}`,
  },
};

function AGEING_COLS() { return ['posting_date', 'party', 'voucher_type', 'voucher_no', 'due_date', 'invoiced', 'paid', 'outstanding', 'age', 'range1', 'range2', 'range3', 'range4', 'range5']; }
function statementFilters(c: Ctx) {
  return { company: c.company, filter_based_on: 'Fiscal Year', from_fiscal_year: c.fy.name, to_fiscal_year: c.fy.name, period_start_date: c.fy.start, period_end_date: c.fy.end, periodicity: 'Yearly', accumulated_values: 1, selected_view: 'Report', include_default_book_entries: 1 };
}
function ageingFilters(c: Ctx, partyType: string) {
  return { company: c.company, report_date: c.today, ageing_based_on: 'Due Date', range: '30, 60, 90, 120', range1: 30, range2: 60, range3: 90, range4: 120, party_type: partyType };
}

let fyCache: Ctx['fy'] | undefined;
async function currentFY(today: string): Promise<Ctx['fy']> {
  if (fyCache) return fyCache;
  const rows = await api.getList<{ name: string; year_start_date: string; year_end_date: string }>('Fiscal Year', {
    fields: ['name', 'year_start_date', 'year_end_date'], filters: [['year_start_date', '<=', today], ['year_end_date', '>=', today], ['disabled', '=', 0]], limit: 1,
  }).catch(() => []);
  if (rows[0]) return (fyCache = { name: rows[0].name, start: rows[0].year_start_date, end: rows[0].year_end_date });
  const y = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0); // Indian FY: April to March
  return (fyCache = { name: `${y}-${y + 1}`, start: `${y}-04-01`, end: `${y + 1}-03-31` });
}

/** Columns arrive as objects or as "Label:Type/Options:width" strings depending on the report. */
function normCols(cols: unknown[]): Col[] {
  return cols.map((c) => {
    if (typeof c === 'string') {
      const [label, type = 'Data'] = c.split(':');
      return { label, fieldname: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), fieldtype: type.split('/')[0] };
    }
    const o = c as Partial<Col> & { hidden?: number };
    return { label: o.label ?? o.fieldname ?? '', fieldname: o.fieldname ?? '', fieldtype: o.fieldtype ?? 'Currency', hidden: o.hidden } as Col;
  }).filter((c) => !(c as { hidden?: number }).hidden);
}

export function ReportScreen({ rkey, account }: { rkey: ReportKey; account?: string }) {
  const { masters, version } = useErp();
  const def = DEFS[rkey];
  const [state, setState] = useState<{ cols: Col[]; rows: Row[]; ctx?: Ctx; error?: string; loading: boolean }>({ cols: [], rows: [], loading: true });
  useEffect(() => {
    let live = true;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      const today = todayISO();
      const ctx: Ctx = { company: masters!.company, fy: await currentFY(today), today, account };
      const filters = Object.fromEntries(Object.entries(def.filters(ctx)).filter(([, v]) => v !== undefined));
      const res = await api.runReport<Row | unknown[]>(def.report, filters);
      let cols = normCols((res.columns ?? []) as unknown[]);
      const rows = (res.result ?? []).map((r) => (Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [c.fieldname, r[i]])) : r)) as Row[];
      if (def.pick) cols = def.pick.map((f) => cols.find((c) => c.fieldname === f)).filter(Boolean) as Col[];
      if (live) setState({ cols, rows: rows.filter((r) => Object.keys(r).length), ctx, loading: false });
    })().catch((e) => live && setState((s) => ({ ...s, loading: false, error: (e as Error).message })));
    return () => { live = false; };
  }, [rkey, account, version]); // eslint-disable-line

  // Tree reports: rows carry `indent`; a row has children when the next row is indented deeper.
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const visible = useMemo(() => {
    const out: number[] = [];
    let hideBelow = Infinity;
    state.rows.forEach((r, i) => {
      const ind = Number(r.indent ?? 0);
      if (ind > hideBelow) return;
      hideBelow = Infinity;
      out.push(i);
      if (closed.has(i)) hideBelow = ind;
    });
    return out;
  }, [state.rows, closed]);
  const hasKids = (i: number) => Number(state.rows[i + 1]?.indent ?? 0) > Number(state.rows[i]?.indent ?? 0);
  const toggle = (i: number, open?: boolean) => setClosed((c) => { const n = new Set(c); (open ?? n.has(i)) ? n.delete(i) : n.add(i); return n; });

  const drill = (r: Row) => {
    const acct = r.account && !String(r.account).startsWith("'") ? String(r.account) : undefined;
    if (def.tree && acct && !hasKidsRow(r)) { erpNav.go({ name: 'report', key: 'gl', account: acct }); return; }
    const vt = r.voucher_type as string | undefined;
    const vn = r.voucher_no as string | undefined;
    if (vt && vn) {
      const t = typeOfDoctype(vt);
      if (t && ((ITEM_TYPES as readonly string[]).includes(t) || vt === 'Payment Entry')) erpNav.go({ name: 'doc', type: t as DocType, id: vn });
      else location.href = deskUrl(vt, vn);
    }
  };
  const hasKidsRow = (r: Row) => hasKids(state.rows.indexOf(r));
  const list = useListNav(visible.length, (k) => {
    const i = visible[k];
    if (def.tree && hasKids(i)) toggle(i); else drill(state.rows[i]);
  }, {
    onKey: (e, k) => {
      const i = visible[k];
      if (e.key === 'ArrowRight' && def.tree && hasKids(i)) { toggle(i, true); return true; }
      if (e.key === 'ArrowLeft' && def.tree && hasKids(i)) { toggle(i, false); return true; }
      if (e.key.toLowerCase() === 'l' && state.rows[i]?.account && def.tree) { erpNav.go({ name: 'report', key: 'gl', account: String(state.rows[i].account) }); return true; }
      if (e.key.toLowerCase() === 'a' && def.tree) { setClosed(closed.size ? new Set() : new Set(state.rows.map((_, j) => j).filter(hasKids))); return true; }
      if (e.key.toLowerCase() === 'o') { location.href = `/app/query-report/${encodeURIComponent(def.report)}`; return true; }
      return false;
    },
  });

  const fmt = (c: Col, v: unknown) => {
    if (v === null || v === undefined || v === '') return '';
    if (['Currency', 'Float'].includes(c.fieldtype) && typeof v === 'number') return c.fieldtype === 'Currency' ? (Math.abs(v) < 0.005 ? '' : money(v)) : qty(v);
    if (c.fieldtype === 'Date') return fmtDate(String(v));
    return String(v).replace(/<[^>]+>/g, '');
  };
  const numeric = (c: Col) => ['Currency', 'Float', 'Int', 'Percent'].includes(c.fieldtype);
  const title = rkey === 'gl' && account ? account : def.title;

  return (
    <div>
      <PageHead title={title} sub={<>{state.ctx ? def.sub(state.ctx) : ''} · live from ERPNext · <Kbd>Enter</Kbd> {def.tree ? 'expand / open ledger' : 'open voucher'}{def.tree && <> · <Kbd>A</Kbd> collapse all</>} · <Kbd>O</Kbd> open in ERPNext</>} />
      {state.error && <div className="errors">{state.error}</div>}
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid report">
          <thead><tr>{state.cols.map((c) => <th key={c.fieldname} className={numeric(c) ? 'num' : ''}>{c.label}</th>)}</tr></thead>
          <tbody>
            {visible.map((i, k) => {
              const r = state.rows[i];
              const { className, ...rp } = list.rowProps(k);
              const bold = (def.tree && hasKids(i)) || /total|profit|loss/i.test(String(r.account_name ?? r.account ?? r.party ?? ''));
              return (
                <tr key={i} {...rp} className={`${className ?? ''} ${bold ? 'r-total' : ''}`} onClick={() => list.setSel(k)}>
                  {state.cols.map((c, ci) => (
                    <td key={c.fieldname} className={numeric(c) ? 'num' : ''} style={ci === 0 && def.tree ? { paddingLeft: 12 + Number(r.indent ?? 0) * 18 } : undefined}>
                      {ci === 0 && def.tree && hasKids(i) && <span className="caret">{closed.has(i) ? '▸' : '▾'}</span>}
                      {fmt(c, ci === 0 && def.tree ? (r.account_name ?? String(r[c.fieldname] ?? '').replace(/^'|'$/g, '')) : r[c.fieldname])}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={state.cols.length || 1} className="muted empty-row">{state.loading ? 'Running report…' : 'No entries.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
