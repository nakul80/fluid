import { useMemo, useState } from 'react';
import { groupPath } from '../domain/reports';
import { Item, Ledger } from '../domain/types';
import { drcr, money, qty } from '../format';
import { nav, newItemId, newLedgerId, saveItem, saveLedger, toast, useStore } from '../store';
import { Kbd, NumInput, PageHead, Picker, TextInput, useListNav } from './common';
import { live } from './options';

export function MastersList({ kind }: { kind: 'ledgers' | 'items' }) {
  const { data, eng } = useStore();
  const { bal, stock } = live(data, eng);
  const [q, setQ] = useState('');
  const ledgers = useMemo(() => data.ledgers.filter((l) => l.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [data, q]);
  const items = useMemo(() => data.items.filter((i) => (i.name + i.sku).toLowerCase().includes(q.toLowerCase())), [data, q]);
  const count = kind === 'ledgers' ? ledgers.length : items.length;
  const list = useListNav(count, (i) => (kind === 'ledgers' ? nav.go({ name: 'ledger', id: ledgers[i].id }) : nav.go({ name: 'item', id: items[i].id })), {
    onKey: (e, i) => {
      const k = e.key.toLowerCase();
      if (e.key === 'N') { nav.go(kind === 'ledgers' ? { name: 'ledgerForm' } : { name: 'itemForm' }); return true; }
      if (e.key === 'M' && count) { nav.go(kind === 'ledgers' ? { name: 'ledgerForm', id: ledgers[i].id } : { name: 'itemForm', id: items[i].id }); return true; }
      if (k === 'tab') { nav.replace({ name: 'masters', kind: kind === 'ledgers' ? 'items' : 'ledgers' }); return true; }
      if (e.key.length === 1 && /[a-z0-9 ]/i.test(e.key) && !e.ctrlKey && !e.altKey) { setQ((s) => s + e.key); return true; }
      if (e.key === 'Backspace') { setQ((s) => s.slice(0, -1)); return true; }
      if (e.key === 'Escape' && q) { setQ(''); return true; }
      return false;
    },
  });
  return (
    <div>
      <PageHead title={kind === 'ledgers' ? 'Ledgers' : 'Stock items'} sub={<>Just type to filter · <Kbd>Enter</Kbd> open · <Kbd>Shift+N</Kbd> new · <Kbd>Shift+M</Kbd> edit · <Kbd>Tab</Kbd> {kind === 'ledgers' ? 'items' : 'ledgers'}</>}>
        {q && <span className="filter-tag">Filter: {q}</span>}
        <button className="primary" onClick={() => nav.go(kind === 'ledgers' ? { name: 'ledgerForm' } : { name: 'itemForm' })}>New {kind === 'ledgers' ? 'ledger' : 'item'}</button>
      </PageHead>
      <div className="table-wrap" tabIndex={0} ref={list.ref} onKeyDown={list.onKeyDown}>
        <table className="grid list">
          {kind === 'ledgers' ? (
            <>
              <thead><tr><th>Ledger</th><th>Group</th><th className="num">Balance</th></tr></thead>
              <tbody>{ledgers.map((l, i) => <tr key={l.id} {...list.rowProps(i)}><td>{l.name}{l.system && <span className="muted small"> · system</span>}</td><td className="muted">{groupPath(data, l.groupId).map((g) => g.name).join(' › ')}</td><td className="num">{drcr(bal.get(l.id) ?? 0)}</td></tr>)}</tbody>
            </>
          ) : (
            <>
              <thead><tr><th>Item</th><th>SKU</th><th>Unit</th><th className="num">Purchase rate</th><th className="num">Sales rate</th><th className="num">In stock</th></tr></thead>
              <tbody>{items.map((it, i) => <tr key={it.id} {...list.rowProps(i)}><td>{it.name}</td><td className="mono muted">{it.sku}</td><td>{it.unit}</td><td className="num">{money(it.purchaseRate)}</td><td className="num">{money(it.salesRate)}</td><td className="num">{qty(stock.get(it.id) ?? 0)}</td></tr>)}</tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
}

function FormShell(props: { title: string; onSave: () => void; children: React.ReactNode; error?: string }) {
  return (
    <div data-form className="docform" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && ['enter', 'a', 's'].includes(e.key.toLowerCase())) { e.preventDefault(); props.onSave(); } }}>
      <PageHead title={props.title} sub={<>Enter moves on · <Kbd>Ctrl+Enter</Kbd> saves · <Kbd>Esc</Kbd> back</>}><button className="primary" onClick={props.onSave}>Save</button></PageHead>
      {props.error && <div className="errors">{props.error}</div>}
      <div className="card master-form">{props.children}<div className="save-row"><button className="primary" data-nav onClick={props.onSave} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); props.onSave(); } }}>Accept and save</button></div></div>
    </div>
  );
}

export function LedgerForm({ id, groupId }: { id?: string; groupId?: string }) {
  const { data } = useStore();
  const existing = data.ledgers.find((l) => l.id === id);
  const [l, setL] = useState<Ledger>(() => existing ? { ...existing } : { id: newLedgerId(), name: '', groupId: groupId ?? 'G_DEBT', opening: 0 });
  const [err, setErr] = useState('');
  const groupOpts = data.groups.map((g) => ({ id: g.id, label: g.name, sub: groupPath(data, g.id).slice(0, -1).map((x) => x.name).join(' › ') || g.nature }));
  const isParty = ['G_DEBT', 'G_CRED'].includes(l.groupId);
  const [side, setSide] = useState<'Dr' | 'Cr'>(l.opening < 0 ? 'Cr' : 'Dr');
  const save = () => {
    const e = saveLedger({ ...l, name: l.name.trim(), opening: side === 'Dr' ? Math.abs(l.opening) : -Math.abs(l.opening) });
    if (e) setErr(e); else { toast(`Ledger “${l.name}” saved`); nav.back(); }
  };
  return (
    <FormShell title={existing ? `Alter ledger` : 'New ledger'} onSave={save} error={err}>
      <div className="fields">
        <label className="field grow"><span>Name</span><TextInput autoFocus value={l.name} onChange={(name) => setL({ ...l, name })} /></label>
        <label className="field grow"><span>Under group</span><Picker value={l.groupId} options={groupOpts} onChange={(gid) => setL({ ...l, groupId: gid })} disabled={existing?.system} /></label>
      </div>
      <div className="fields">
        <label className="field w-amt"><span>Opening balance</span><NumInput value={Math.abs(l.opening)} onChange={(n) => setL({ ...l, opening: n })} /></label>
        <label className="field w-unit"><span>Dr / Cr</span>
          <select data-nav value={side} onChange={(e) => setSide(e.target.value as 'Dr' | 'Cr')} onKeyDown={(e) => { if (e.key.toLowerCase() === 'd') setSide('Dr'); if (e.key.toLowerCase() === 'c') setSide('Cr'); }}><option>Dr</option><option>Cr</option></select>
        </label>
        {isParty && <label className="field w-amt"><span>Credit days</span><NumInput value={l.creditDays ?? 0} onChange={(n) => setL({ ...l, creditDays: n })} /></label>}
        {isParty && <label className="field grow"><span>Phone</span><TextInput value={l.phone ?? ''} onChange={(phone) => setL({ ...l, phone })} /></label>}
      </div>
    </FormShell>
  );
}

export function ItemForm({ id }: { id?: string }) {
  const { data } = useStore();
  const existing = data.items.find((i) => i.id === id);
  const [it, setIt] = useState<Item>(() => existing ? { ...existing } : { id: newItemId(), name: '', sku: '', unit: 'Pcs', purchaseRate: 0, salesRate: 0, reorderLevel: 0, openingQty: 0, openingRate: 0 });
  const [err, setErr] = useState('');
  const set = (p: Partial<Item>) => setIt({ ...it, ...p });
  const save = () => {
    const e = saveItem({ ...it, name: it.name.trim() });
    if (e) setErr(e); else { toast(`Item “${it.name}” saved`); nav.back(); }
  };
  return (
    <FormShell title={existing ? 'Alter stock item' : 'New stock item'} onSave={save} error={err}>
      <div className="fields">
        <label className="field grow"><span>Name</span><TextInput autoFocus value={it.name} onChange={(name) => set({ name })} /></label>
        <label className="field w-rate"><span>SKU / code</span><TextInput value={it.sku} onChange={(sku) => set({ sku })} /></label>
        <label className="field w-unit"><span>Unit</span><TextInput value={it.unit} onChange={(unit) => set({ unit })} /></label>
      </div>
      <div className="fields">
        <label className="field w-amt"><span>Purchase rate</span><NumInput value={it.purchaseRate} onChange={(n) => set({ purchaseRate: n })} /></label>
        <label className="field w-amt"><span>Sales rate</span><NumInput value={it.salesRate} onChange={(n) => set({ salesRate: n })} /></label>
        <label className="field w-amt"><span>Reorder level</span><NumInput value={it.reorderLevel} onChange={(n) => set({ reorderLevel: n })} /></label>
      </div>
      <div className="fields">
        <label className="field w-amt"><span>Opening qty</span><NumInput value={it.openingQty} onChange={(n) => set({ openingQty: n })} /></label>
        <label className="field w-amt"><span>Opening rate</span><NumInput value={it.openingRate} onChange={(n) => set({ openingRate: n })} /></label>
        <div className="field w-amt"><span>Opening value</span><div className="readout">₹ {money(it.openingQty * it.openingRate)}</div></div>
      </div>
    </FormShell>
  );
}
