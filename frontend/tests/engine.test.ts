import { describe, expect, it } from 'vitest';
import { compute, docStatus, pendingLines, validate, chainOf } from '../src/domain/engine';
import { balanceSheet, balances, profitAndLoss, stockSummary } from '../src/domain/reports';
import { seed } from '../src/domain/seed';
import { SYS } from '../src/domain/types';

const today = '2026-10-15';

describe('posting engine on demo data', () => {
  const data = seed();
  const eng = compute(data);

  it('every document balances', () => {
    const byDoc = new Map<string, number>();
    for (const p of eng.postings) byDoc.set(p.docId, (byDoc.get(p.docId) ?? 0) + p.amount);
    for (const [, v] of byDoc) expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it('demo data validates', () => {
    expect(validate(data, eng)).toEqual([]);
  });

  it('balance sheet tallies', () => {
    const bs = balanceSheet(data, eng, data.company.fyStart, today);
    expect(bs.totalAssets).toBeCloseTo(bs.totalLiab, 2);
  });

  it('stock ledger value matches stock summary', () => {
    const bal = balances(data, eng, today);
    const total = stockSummary(data, eng).reduce((s, r) => s + r.value, 0);
    expect(bal.get(SYS.stock)).toBeCloseTo(total, 1);
  });

  it('GRNI holds only received-not-billed goods (none here, plus tube variance in PPV)', () => {
    const bal = balances(data, eng, today);
    expect(bal.get(SYS.grni) ?? 0).toBeCloseTo(0, 2);
    expect(bal.get(SYS.ppv)).toBeCloseTo(200, 2);
  });

  it('statuses reflect the cycles', () => {
    const s = (id: string) => docStatus(eng.byId.get(id)!, eng, today).label;
    expect(s('PO_1')).toBe('Billed');
    expect(s('PO_2')).toBe('Part received');
    expect(s('PO_3')).toBe('Open');
    expect(s('SO_2')).toBe('Part delivered');
    expect(s('DN_2')).toBe('To be invoiced');
    expect(s('SINV_1')).toBe('Part paid');
    expect(s('SINV_2')).toBe('Overdue');
    expect(s('PBILL_1')).toBe('Paid');
  });

  it('pending lines drive conversions', () => {
    const grnFromPo2 = pendingLines(data, eng, 'GRN', 'V_PRAKASH');
    expect(grnFromPo2.map((p) => [p.itemId, p.remaining])).toEqual([['I_TUBE', 100]]);
    const inv = pendingLines(data, eng, 'SINV', 'C_SHARMA');
    expect(inv.map((p) => [p.doc.type, p.itemId, p.remaining])).toEqual([
      ['SO', 'I_MCB', 50],
      ['DN', 'I_BULB', 300],
    ]);
  });

  it('chain links order to payment', () => {
    expect(chainOf(eng, 'PO_1').map((d) => d.type)).toEqual(['PO', 'GRN', 'PBILL', 'PAY']);
  });

  it('blocks over-receiving', () => {
    const d2 = structuredClone(data);
    d2.docs.push({ ...structuredClone(d2.docs.find((d) => d.id === 'GRN_2')!), id: 'GRN_X', number: 'GRN-X' });
    const errs = validate(d2, compute(d2), 'GRN_X');
    expect(errs.join(' ')).toMatch(/beyond the ordered/);
  });

  it('P&L has a gross profit', () => {
    const pl = profitAndLoss(data, eng, data.company.fyStart, today);
    expect(pl.gross).toBeGreaterThan(0);
  });
});
