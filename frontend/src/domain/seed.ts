import { Data, Doc, DocType, DOC_META, EntryLine, Group, ItemLine, Ledger, SYS } from './types';

const G = (id: string, name: string, nature: Group['nature'], parentId?: string, direct?: boolean): Group => ({ id, name, nature, parentId, direct });

export const DEFAULT_GROUPS: Group[] = [
  G('G_CAP', 'Capital Account', 'Equity'),
  G('G_LOANS', 'Loans (Liability)', 'Liability'),
  G('G_CL', 'Current Liabilities', 'Liability'),
  G('G_CRED', 'Sundry Creditors', 'Liability', 'G_CL'),
  G('G_PROV', 'Provisions', 'Liability', 'G_CL'),
  G('G_DUTY', 'Duties & Taxes', 'Liability', 'G_CL'),
  G('G_FA', 'Fixed Assets', 'Asset'),
  G('G_CA', 'Current Assets', 'Asset'),
  G('G_DEBT', 'Sundry Debtors', 'Asset', 'G_CA'),
  G('G_BANK', 'Bank Accounts', 'Asset', 'G_CA'),
  G('G_CASH', 'Cash-in-Hand', 'Asset', 'G_CA'),
  G('G_STOCK', 'Stock-in-Hand', 'Asset', 'G_CA'),
  G('G_ADV', 'Loans & Advances (Asset)', 'Asset', 'G_CA'),
  G('G_SALES', 'Sales Accounts', 'Income', undefined, true),
  G('G_DINC', 'Direct Incomes', 'Income', undefined, true),
  G('G_IINC', 'Indirect Incomes', 'Income'),
  G('G_DEXP', 'Direct Expenses', 'Expense', undefined, true),
  G('G_IEXP', 'Indirect Expenses', 'Expense'),
];

export const PARTY_GROUPS = ['G_DEBT', 'G_CRED'];
export const CASH_GROUPS = ['G_BANK', 'G_CASH'];

const L = (id: string, name: string, groupId: string, opening = 0, extra: Partial<Ledger> = {}): Ledger => ({ id, name, groupId, opening, ...extra });

export function seed(): Data {
  const ledgers: Ledger[] = [
    L('L_CAPITAL', 'Proprietor Capital', 'G_CAP', -994200),
    L('L_HDFC', 'HDFC Bank', 'G_BANK', 650000),
    L('L_CASH', 'Cash', 'G_CASH', 50000),
    L('L_FURN', 'Furniture & Fixtures', 'G_FA', 100000),
    L(SYS.stock, 'Stock-in-Hand', 'G_STOCK', 0, { system: true }),
    L(SYS.grni, 'Goods Received Not Invoiced', 'G_CL', 0, { system: true }),
    L(SYS.sales, 'Sales', 'G_SALES', 0, { system: true }),
    L(SYS.cogs, 'Cost of Goods Sold', 'G_DEXP', 0, { system: true }),
    L(SYS.ppv, 'Purchase Price Variance', 'G_DEXP', 0, { system: true }),
    L('L_FREIGHT', 'Freight Inward', 'G_DEXP'),
    L('L_RENT', 'Shop Rent', 'G_IEXP'),
    L('L_SAL', 'Staff Salaries', 'G_IEXP'),
    L('L_ELEC', 'Electricity', 'G_IEXP'),
    L('L_OFFICE', 'Office Expenses', 'G_IEXP'),
    L('L_INT', 'Interest Received', 'G_IINC'),
    L('L_PROVEXP', 'Expenses Payable', 'G_PROV'),
    L('C_SHARMA', 'Sharma Electricals', 'G_DEBT', 0, { creditDays: 30, phone: '98100 22331' }),
    L('C_MEHTA', 'Mehta Constructions', 'G_DEBT', 0, { creditDays: 45, phone: '98200 44120' }),
    L('C_BRIGHT', 'Bright Home Stores', 'G_DEBT', 0, { creditDays: 15, phone: '99300 10877' }),
    L('V_WIRE', 'Wirecraft Cables Pvt Ltd', 'G_CRED', 0, { creditDays: 30 }),
    L('V_PRAKASH', 'Prakash Lighting Co', 'G_CRED', 0, { creditDays: 30 }),
    L('V_RAJ', 'Raj Electric Distributors', 'G_CRED', 0, { creditDays: 45 }),
  ];
  const items = [
    { id: 'I_BULB', name: 'LED Bulb 9W', sku: 'LB-9W', unit: 'Pcs', purchaseRate: 55, salesRate: 85, reorderLevel: 100, openingQty: 400, openingRate: 55 },
    { id: 'I_FAN', name: 'Ceiling Fan 1200mm', sku: 'CF-1200', unit: 'Nos', purchaseRate: 1450, salesRate: 2100, reorderLevel: 10, openingQty: 40, openingRate: 1450 },
    { id: 'I_WIRE', name: 'Copper Wire 1.5 sqmm (90 m)', sku: 'CW-15', unit: 'Coil', purchaseRate: 1150, salesRate: 1500, reorderLevel: 20, openingQty: 60, openingRate: 1150 },
    { id: 'I_MCB', name: 'MCB 32A Single Pole', sku: 'MCB-32', unit: 'Pcs', purchaseRate: 180, salesRate: 260, reorderLevel: 40, openingQty: 150, openingRate: 180 },
    { id: 'I_EXT', name: 'Extension Board 4-way', sku: 'EB-4', unit: 'Pcs', purchaseRate: 210, salesRate: 320, reorderLevel: 25, openingQty: 80, openingRate: 210 },
    { id: 'I_TUBE', name: 'LED Tube 20W', sku: 'LT-20', unit: 'Pcs', purchaseRate: 140, salesRate: 210, reorderLevel: 50, openingQty: 10, openingRate: 140 },
  ];

  const data: Data = {
    company: { name: 'Shree Ganesh Electricals', fyStart: '2026-04-01' },
    groups: DEFAULT_GROUPS,
    ledgers,
    items,
    docs: [],
    seq: {},
  };

  const mk = (type: DocType, date: string, fields: Partial<Doc>): Doc => {
    const n = (data.seq[type] = (data.seq[type] ?? 0) + 1);
    const d: Doc = {
      id: `${type}_${n}`,
      type,
      number: `${DOC_META[type].prefix}-${String(n).padStart(4, '0')}`,
      date,
      lines: [],
      narration: '',
      status: 'posted',
      audit: [{ at: `${date}T10:00:00.000Z`, action: 'created' }],
      ...fields,
    };
    data.docs.push(d);
    return d;
  };
  const ln = (itemId: string, qty: number, rate: number, src?: [Doc, number]): ItemLine => ({ itemId, qty, rate, src: src ? { docId: src[0].id, line: src[1] } : undefined });
  const je = (ledgerId: string, dr: number, cr: number): EntryLine => ({ ledgerId, dr, cr });

  // Purchase cycle 1: fully closed
  const po1 = mk('PO', '2026-08-20', { partyId: 'V_WIRE', lines: [ln('I_WIRE', 50, 1150)], narration: 'Monsoon stock-up' });
  const grn1 = mk('GRN', '2026-08-25', { partyId: 'V_WIRE', lines: [ln('I_WIRE', 50, 1150, [po1, 0])] });
  const pb1 = mk('PBILL', '2026-08-26', { partyId: 'V_WIRE', dueDate: '2026-09-25', lines: [ln('I_WIRE', 50, 1150, [grn1, 0])], narration: 'Inv WC/2341' });
  mk('PAY', '2026-09-20', { partyId: 'V_WIRE', accountId: 'L_HDFC', amount: 57500, allocations: [{ docId: pb1.id, amount: 57500 }], narration: 'NEFT' });

  // Purchase cycle 2: partly received, billed with a price difference, unpaid
  const po2 = mk('PO', '2026-09-28', { partyId: 'V_PRAKASH', lines: [ln('I_BULB', 500, 54), ln('I_TUBE', 200, 138)] });
  const grn2 = mk('GRN', '2026-10-05', { partyId: 'V_PRAKASH', lines: [ln('I_BULB', 500, 54, [po2, 0]), ln('I_TUBE', 100, 138, [po2, 1])], narration: 'Tubes short-shipped, balance next week' });
  mk('PBILL', '2026-10-06', { partyId: 'V_PRAKASH', dueDate: '2026-11-05', lines: [ln('I_BULB', 500, 54, [grn2, 0]), ln('I_TUBE', 100, 140, [grn2, 1])], narration: 'Inv PL-8812' });

  // Purchase cycle 3: just ordered
  mk('PO', '2026-10-10', { partyId: 'V_RAJ', lines: [ln('I_FAN', 30, 1440), ln('I_MCB', 100, 178)] });

  // Sales cycle 1: delivered, invoiced, part paid
  const so1 = mk('SO', '2026-09-01', { partyId: 'C_MEHTA', lines: [ln('I_FAN', 25, 2050), ln('I_WIRE', 40, 1480)], narration: 'Site: Andheri tower B' });
  const dn1 = mk('DN', '2026-09-05', { partyId: 'C_MEHTA', lines: [ln('I_FAN', 25, 2050, [so1, 0]), ln('I_WIRE', 40, 1480, [so1, 1])] });
  const si1 = mk('SINV', '2026-09-05', { partyId: 'C_MEHTA', dueDate: '2026-10-20', lines: [ln('I_FAN', 25, 2050, [dn1, 0]), ln('I_WIRE', 40, 1480, [dn1, 1])] });
  mk('RCPT', '2026-09-30', { partyId: 'C_MEHTA', accountId: 'L_HDFC', amount: 50000, allocations: [{ docId: si1.id, amount: 50000 }], narration: 'Cheque 004512' });

  // Sales cycle 2: delivered part, not invoiced
  const so2 = mk('SO', '2026-10-08', { partyId: 'C_SHARMA', lines: [ln('I_BULB', 300, 82), ln('I_MCB', 50, 255)] });
  mk('DN', '2026-10-12', { partyId: 'C_SHARMA', lines: [ln('I_BULB', 300, 82, [so2, 0])] });

  // Direct invoice, overdue
  mk('SINV', '2026-08-10', { partyId: 'C_BRIGHT', dueDate: '2026-08-25', lines: [ln('I_EXT', 20, 320), ln('I_BULB', 50, 85)], narration: 'Counter sale on credit' });

  // Plain accounting vouchers
  mk('PAY', '2026-10-01', { partyId: 'L_RENT', accountId: 'L_HDFC', amount: 35000, narration: 'Shop rent for October' });
  mk('JRNL', '2026-09-30', { entries: [je('L_ELEC', 8400, 0), je('L_PROVEXP', 0, 8400)], narration: 'Electricity bill for September, payable' });
  mk('CONTRA', '2026-10-02', { entries: [je('L_CASH', 20000, 0), je('L_HDFC', 0, 20000)], narration: 'Cash withdrawn for petty expenses' });
  mk('PAY', '2026-10-03', { partyId: 'L_OFFICE', accountId: 'L_CASH', amount: 2350, narration: 'Stationery and tea' });

  return data;
}
