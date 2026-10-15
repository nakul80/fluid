# Fluid ERP

A web-based, keyboard-first accounting and inventory app for Indian businesses, inspired by Tally. Version 1 covers accounts and stock with full purchase and sales cycles (no GST or payroll yet). See [../docs/PLAN.md](../docs/PLAN.md) for the design plan and stack.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # posting-engine tests
npm run build        # production bundle in dist/
npm run artifact     # single-file demo page in dist-single/
npm run e2e -- <dir> # keyboard walkthrough in headless Chromium, screenshots to <dir>
```

The prototype keeps its data in the browser (localStorage) and starts with a demo company. `Ctrl+K` → "Reset demo company" restores it.

## Keys

| Key | Does |
|---|---|
| F4 / F5 / F6 / F7 | Contra / Payment / Receipt / Journal |
| F8 / F9 | Sales Invoice / Purchase Bill |
| Shift+F8 / Shift+F9 | Sales Order / Purchase Order |
| Alt+F8 / Alt+F9 | Delivery Note / Goods Receipt |
| Ctrl+K (or Alt+G) | Go to any screen, ledger, item or voucher |
| G then a letter | Jump: H home, D day book, U purchase cycle, S sales cycle, R receivables, Y payables, K stock, T trial balance, P P&L, B balance sheet, L ledgers, I items (letters alone work on the home screen) |
| Enter / Shift+Enter | Next / previous field; on lists and reports, open or drill down |
| Ctrl+Enter, Ctrl+A, Ctrl+S | Save the voucher |
| Esc | Back (asks before discarding unsaved changes) |
| Alt+C | Create the ledger or item you just typed, without leaving the voucher |
| Alt+L | Pull pending order / receipt / delivery lines for the chosen party |
| Alt+A | Re-allocate a payment or receipt to bills, oldest first |
| Alt+D | Remove the current line |
| On a saved document | R receive, B bill, D deliver, I invoice, P pay / receive, E edit, X cancel, 1–9 open a linked document |

Dates accept `15`, `15-10`, `15 oct`, `t` (today), `+1` / `-1`.

## Code map

- `src/domain/` posting engine, reports and demo data. Pure TypeScript with no UI imports, so it can move to the server unchanged.
- `src/store.ts` app state, saving and validation, navigation stack.
- `src/ui/` screens: `DocForm` (all vouchers and orders), `Lists` (day book, cycle boards), `Reports`, `Masters`, `App` (shell, hotkeys, command bar, dashboard).
- `tests/` engine unit tests and the browser walkthrough.
