import { Engine } from '../domain/engine';
import { balances, groupPath, itemPipeline, stockSummary } from '../domain/reports';
import { Data, Ledger } from '../domain/types';
import { drcr, qty } from '../format';
import { Option } from './common';

const cache = new WeakMap<Engine, { bal: Map<string, number>; stock: Map<string, number> }>();

export function live(data: Data, eng: Engine) {
  let c = cache.get(eng);
  if (!c) {
    c = { bal: balances(data, eng), stock: new Map(stockSummary(data, eng).map((r) => [r.item.id, r.qty])) };
    cache.set(eng, c);
  }
  return c;
}

export function ledgerOptions(data: Data, eng: Engine, filter: (l: Ledger) => boolean = () => true): Option[] {
  const { bal } = live(data, eng);
  return data.ledgers
    .filter(filter)
    .map((l) => ({ id: l.id, label: l.name, sub: groupPath(data, l.groupId).at(-1)?.name, hint: drcr(bal.get(l.id) ?? 0) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function itemOptions(data: Data, eng: Engine): Option[] {
  const { stock } = live(data, eng);
  return data.items
    .map((i) => {
      const p = itemPipeline(data, eng, i.id);
      const extra = [p.onOrder ? `+${qty(p.onOrder)} on order` : '', p.committed ? `${qty(p.committed)} committed` : ''].filter(Boolean).join(' · ');
      return { id: i.id, label: i.name, sub: i.sku, hint: `${qty(stock.get(i.id) ?? 0)} ${i.unit}${extra ? ' · ' + extra : ''}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const underGroups = (data: Data, groupIds: string[]) => (l: Ledger) => groupPath(data, l.groupId).some((g) => groupIds.includes(g.id));
