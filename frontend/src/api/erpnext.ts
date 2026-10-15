import { DocType } from '../domain/types';
import { Filters, Frappe } from './frappe';

/** Fluid ERP document type → ERPNext DocType. */
export const DOCTYPE: Record<DocType, string> = {
  PO: 'Purchase Order', GRN: 'Purchase Receipt', PBILL: 'Purchase Invoice',
  SO: 'Sales Order', DN: 'Delivery Note', SINV: 'Sales Invoice',
  PAY: 'Payment Entry', RCPT: 'Payment Entry', JRNL: 'Journal Entry', CONTRA: 'Journal Entry',
};

/** ERPNext's own mapper methods for "create the next document from this one" (R / B / D / I / P keys). */
const MAKE: Partial<Record<DocType, Partial<Record<DocType, string>>>> = {
  PO: {
    GRN: 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt',
    PBILL: 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice',
  },
  GRN: { PBILL: 'erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice' },
  SO: {
    DN: 'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note',
    SINV: 'erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice',
  },
  DN: { SINV: 'erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice' },
};

/** Returns an unsaved draft of `target` prefilled with the pending lines of `sourceName`. */
export async function makeNext(api: Frappe, source: DocType, sourceName: string, target: DocType) {
  if (target === 'PAY' || target === 'RCPT') {
    return api.call<Record<string, unknown>>('erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry', { dt: DOCTYPE[source], dn: sourceName });
  }
  const method = MAKE[source]?.[target];
  if (!method) throw new Error(`Cannot create ${DOCTYPE[target]} from ${DOCTYPE[source]}`);
  return api.call<Record<string, unknown>>(method, { source_name: sourceName });
}

/** Open documents for each column of the cycle boards, using ERPNext's own progress fields. */
export function cycleQueries(side: 'purchase' | 'sales'): { title: string; doctype: string; filters: Filters; fields: string[] }[] {
  const P = side === 'purchase';
  const party = P ? 'supplier' : 'customer';
  const submitted = ['docstatus', '=', 1];
  return [
    { title: P ? 'Ordered, not received' : 'Ordered, not delivered', doctype: P ? 'Purchase Order' : 'Sales Order',
      filters: [submitted, [P ? 'per_received' : 'per_delivered', '<', 100], ['status', 'not in', ['Closed', 'On Hold']]],
      fields: ['name', party, 'transaction_date', 'grand_total', P ? 'per_received' : 'per_delivered'] },
    { title: P ? 'Received, not billed' : 'Delivered, not invoiced', doctype: P ? 'Purchase Receipt' : 'Delivery Note',
      filters: [submitted, ['per_billed', '<', 100], ['status', '!=', 'Closed']],
      fields: ['name', party, 'posting_date', 'grand_total', 'per_billed'] },
    { title: P ? 'Billed, to pay' : 'Invoiced, to collect', doctype: P ? 'Purchase Invoice' : 'Sales Invoice',
      filters: [submitted, ['outstanding_amount', '>', 0]],
      fields: ['name', party, 'posting_date', 'due_date', 'grand_total', 'outstanding_amount'] },
  ];
}

/** Account balance as shown next to ledgers in pickers. */
export function balanceOn(api: Frappe, account: string, company: string, date?: string) {
  return api.call<number>('erpnext.accounts.utils.get_balance_on', { account, company, date });
}
