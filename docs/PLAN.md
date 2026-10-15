# Fluid ERP: design plan (v1)

Scope for v1: **accounts + inventory**, with the full **purchase and sales cycles**. No GST, no payroll yet.

## 1. What we keep from Tally

- Keyboard first. Every screen works without a mouse. Enter moves to the next field, Esc goes back, function keys open vouchers (F4 Contra, F5 Payment, F6 Receipt, F7 Journal, F8 Sales, F9 Purchase).
- Type-ahead pickers for ledgers and items that show the live balance or stock while you pick.
- Create a missing ledger or item on the fly from inside a voucher (Tally's Alt+C).
- Indian conventions: Dr/Cr display, lakh/crore digit grouping, Tally-style group tree (Sundry Debtors, Sundry Creditors, Bank Accounts, Stock-in-Hand and so on), financial year April to March.
- Drill down from any report: Trial Balance → Ledger → Voucher.
- Fast date entry: type `15` for the 15th of this month, `15-10` for 15 Oct.

## 2. What we change (the Tally quirks)

| Tally today | Fluid ERP |
|---|---|
| Everything is a voucher. Orders, receipt notes and invoices are loosely related, and tracking an order to payment needs manual "tracking numbers". | **Documents first.** Purchase Order → Goods Receipt → Purchase Bill → Payment, and Sales Order → Delivery Note → Sales Invoice → Receipt are linked line by line. Each document shows its full chain and its status (Open, Partly received, Billed, Paid). |
| No view of "where is each order right now". | **Cycle boards** for purchase and sales: what is ordered but not received, received but not billed, billed but unpaid. |
| Bill-wise details are optional and easy to get wrong. | Every bill carries its own outstanding. Payments and receipts are allocated to bills, with ageing. |
| Goods received before the bill sit outside the books. | Perpetual inventory: a Goods Receipt posts stock against a *Goods Received Not Invoiced* account, the bill clears it, price differences go to a variance ledger. Deliveries post cost of goods sold at moving average cost. |
| F-key shortcuts are inconsistent across vouchers (Alt+F4 even closes the window in a browser). | One consistent scheme: plain F-key = invoice/voucher, **Shift**+F-key = order, **Alt**+F-key = goods movement. Plus a **Ctrl+K command bar** that finds any screen, ledger, item or document by typing. |
| Edits and deletes silently change history. | Posted documents are never deleted, only cancelled with a reason, and every change is kept in an audit trail. |
| Desktop install, one data folder, licence per machine. | Web app, multi-user, cloud database. |
| Dated, monochrome screens. | Modern dense layout with light and dark themes; the same information density accountants are used to. |

## 3. Recommended stack

- **Front end:** React + TypeScript, built with Vite. A small custom keyboard layer (focus manager, global hotkeys, command bar) rather than a component library, since keyboard flow is the product.
- **Back end:** Node.js + TypeScript (Fastify), so the posting engine is one shared TypeScript module used by both the browser (instant previews) and the server (the source of truth).
- **Database:** PostgreSQL. Documents, an append-only journal table and a stock-movement table; balances via indexed aggregates. Row-level security per company.
- **Auth and multi-company:** company per tenant, roles (owner, accountant, data entry, viewer).
- **Hosting:** any container host; one Postgres instance per region.

Why: one language end to end, Postgres gives us strict transactions for double entry, and nothing exotic to hire for.

## 4. Domain model

- **Masters:** Groups (Tally-style tree), Ledgers (parties are ledgers under Sundry Debtors / Creditors), Stock Items (unit, rates, reorder level, opening stock).
- **Documents:** PO, GRN, Purchase Bill, SO, Delivery Note, Sales Invoice, Payment, Receipt, Journal, Contra. Lines can point to a line of an upstream document, which is how quantities flow down the chain.
- **Posting engine:** a pure function that replays posted documents in date order and produces journal entries and stock movements. Orders post nothing; they only carry open quantities.

| Document | Accounting | Stock |
|---|---|---|
| Goods Receipt | Dr Stock-in-Hand, Cr GRNI | + qty at PO rate |
| Purchase Bill (from GRN) | Dr GRNI, Dr/Cr Price Variance, Cr Vendor | none |
| Purchase Bill (direct) | Dr Stock-in-Hand, Cr Vendor | + qty |
| Delivery Note | Dr Cost of Goods Sold, Cr Stock-in-Hand | − qty at avg cost |
| Sales Invoice | Dr Customer, Cr Sales | none (direct invoice also moves stock and COGS) |
| Payment / Receipt | Party vs Bank/Cash, allocated to bills | none |

## 5. Prototype (this build)

The prototype is the front end with the posting engine running in the browser and data saved in the browser (localStorage), seeded with a demo company. It is enough to try the keyboard flow and the full cycles end to end. Moving to the server means lifting `src/domain` unchanged into the API.

## 6. Next after v1

Server + Postgres + login, multiple godowns, credit and debit notes, batch/serial tracking, GST, bank reconciliation, Excel import of masters and opening balances, print/PDF formats.
