# Fluid ERP on ERPNext (Frappe)

Fluid ERP becomes a keyboard-first front end; ERPNext is the system of record. The in-browser engine (`src/domain`) is retired once the adapter is live; its validations are replaced by ERPNext's own.

## Screen → ERPNext mapping

| Fluid ERP | ERPNext DocType | Create-from (server method) |
|---|---|---|
| Purchase Order (Shift+F9) | Purchase Order | — |
| Goods Receipt (Alt+F9) | Purchase Receipt | `erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt` |
| Purchase Bill (F9) | Purchase Invoice | `...purchase_order.make_purchase_invoice`, `erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice` |
| Sales Order (Shift+F8) | Sales Order | — |
| Delivery Note (Alt+F8) | Delivery Note | `erpnext.selling.doctype.sales_order.sales_order.make_delivery_note` |
| Sales Invoice (F8) | Sales Invoice | `...sales_order.make_sales_invoice`, `erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice` |
| Payment / Receipt (F5 / F6) | Payment Entry (Pay / Receive), references = bill allocations | `erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry` |
| Journal / Contra (F7 / F4) | Journal Entry (voucher_type Journal Entry / Contra Entry) | — |
| Ledgers | Account (+ Customer / Supplier for parties) | — |
| Stock items | Item, Warehouse | — |
| Cancel (X) | `docstatus` 2 via `frappe.client.cancel` | — |
| Document flow panel | links via `against_*` / `*_detail` item fields, Payment Entry references | — |
| Trial Balance / P&L / Balance Sheet | `frappe.desk.query_report.run` (Trial Balance, Profit and Loss Statement, Balance Sheet) | — |
| Receivables / Payables | Accounts Receivable / Accounts Payable reports | — |
| Stock Summary | Stock Balance report, `Bin` (actual, ordered, reserved qty) | — |
| Cycle boards | lists filtered on `per_received`, `per_billed`, `per_delivered`, `outstanding_amount`, `status` | — |
| Picker balances | `erpnext.accounts.utils.get_balance_on`, `Bin.actual_qty` | — |

Save = insert then submit (`docstatus` 1); ERPNext posts GL and stock ledger entries itself.

## Hosting options

1. **Frappe app on the site (preferred):** the React build ships inside a small custom app served at `/fluid`, using the logged-in session cookie (no CORS, no stored keys). Needs a Frappe Cloud private bench to install custom apps.
2. **Separate site:** static hosting; users sign in via `/api/method/login`; site config needs `allow_cors` for the front-end origin and cross-site cookies.

API keys (`FRAPPE_API_KEY` / `FRAPPE_API_SECRET`) are only for development and tests, never shipped in the browser bundle.
