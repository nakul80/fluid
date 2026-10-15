export type Nature = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export interface Group {
  id: string;
  name: string;
  parentId?: string;
  nature: Nature;
  /** Gross-profit groups (Sales, Purchase, Direct Exp/Inc) appear above the GP line in P&L. */
  direct?: boolean;
}

export interface Ledger {
  id: string;
  name: string;
  groupId: string;
  /** Opening balance, Dr positive / Cr negative. */
  opening: number;
  creditDays?: number;
  phone?: string;
  system?: boolean;
}

export interface Item {
  id: string;
  name: string;
  sku: string;
  unit: string;
  salesRate: number;
  purchaseRate: number;
  reorderLevel: number;
  openingQty: number;
  openingRate: number;
}

export type DocType =
  | 'PO' | 'GRN' | 'PBILL'
  | 'SO' | 'DN' | 'SINV'
  | 'PAY' | 'RCPT' | 'JRNL' | 'CONTRA';

export interface LineRef { docId: string; line: number }

export interface ItemLine {
  itemId: string;
  qty: number;
  rate: number;
  /** Upstream line this line fulfils (PO line for a GRN, GRN or PO line for a bill...). */
  src?: LineRef;
}

export interface EntryLine { ledgerId: string; dr: number; cr: number }

export interface Allocation { docId: string; amount: number }

export interface AuditEvent { at: string; action: 'created' | 'edited' | 'cancelled'; note?: string }

export interface Doc {
  id: string;
  type: DocType;
  number: string;
  date: string; // YYYY-MM-DD
  partyId?: string;
  /** Item documents */
  lines: ItemLine[];
  /** Payment / receipt: bank or cash ledger and amount */
  accountId?: string;
  amount?: number;
  allocations?: Allocation[];
  /** Journal / contra */
  entries?: EntryLine[];
  narration: string;
  status: 'posted' | 'cancelled';
  dueDate?: string;
  audit: AuditEvent[];
}

export interface Company {
  name: string;
  fyStart: string; // YYYY-MM-DD
}

export interface Data {
  company: Company;
  groups: Group[];
  ledgers: Ledger[];
  items: Item[];
  docs: Doc[];
  seq: Record<string, number>;
}

export const DOC_META: Record<DocType, { label: string; short: string; prefix: string; key: string; side: 'purchase' | 'sales' | 'accounts'; items: boolean }> = {
  PO: { label: 'Purchase Order', short: 'PO', prefix: 'PO', key: 'Shift+F9', side: 'purchase', items: true },
  GRN: { label: 'Goods Receipt', short: 'GRN', prefix: 'GRN', key: 'Alt+F9', side: 'purchase', items: true },
  PBILL: { label: 'Purchase Bill', short: 'Bill', prefix: 'PB', key: 'F9', side: 'purchase', items: true },
  SO: { label: 'Sales Order', short: 'SO', prefix: 'SO', key: 'Shift+F8', side: 'sales', items: true },
  DN: { label: 'Delivery Note', short: 'DN', prefix: 'DN', key: 'Alt+F8', side: 'sales', items: true },
  SINV: { label: 'Sales Invoice', short: 'Invoice', prefix: 'SI', key: 'F8', side: 'sales', items: true },
  PAY: { label: 'Payment', short: 'Payment', prefix: 'PMT', key: 'F5', side: 'accounts', items: false },
  RCPT: { label: 'Receipt', short: 'Receipt', prefix: 'RCT', key: 'F6', side: 'accounts', items: false },
  JRNL: { label: 'Journal', short: 'Journal', prefix: 'JV', key: 'F7', side: 'accounts', items: false },
  CONTRA: { label: 'Contra', short: 'Contra', prefix: 'CV', key: 'F4', side: 'accounts', items: false },
};

/** Fixed system ledger ids the posting engine relies on. */
export const SYS = {
  stock: 'L_STOCK',
  grni: 'L_GRNI',
  cogs: 'L_COGS',
  sales: 'L_SALES',
  ppv: 'L_PPV',
  openingDiff: 'L_OPENDIFF',
} as const;
