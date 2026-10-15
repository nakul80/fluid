# Daily review: flip cards (ERPNext Web Page)

A mobile-first page with 16 cards for one production day (6 AM to 6 AM). Each card shows one number with an on-target / watch / below marker; tap it to flip and see the breakdown. `sample-preview.html` shows the look with made-up data (cards flip; nothing loads).

| Group | Cards (front → back) |
|---|---|
| Production | **DRI production** vs daily target → by kiln, MTD vs pro-rata · **Yield** → pellet / ore by kiln · **"A" grade** → A / B hours by kiln · **Specific coal** → coal by type, sp. iron, sp. dolomite · **DRI quality** Fe(M) → Fe(M) / C / S by kiln, non-mag |
| Power plant | **Power generated** vs 14 MW → by kiln, running hours · **Power balance** (grid import) → generated, import, DRI, aux, export, other · **Steam & SSC** → steam, PLF, PF, DM water · **Remarks & breakdowns** → full list |
| Weighbridge | **Inward** MT → by material · **Outward** MT → by party · **Truck turnaround** → TAT distribution, trucks waiting |
| Sales (FG-0001) | **Invoiced today** → by customer · **Invoiced this month** → orders booked · **Pending to deliver** → by customer with overdue |
| Receivables | **Overdue** → ageing buckets, most overdue customers |

## Install

1. Create a **Web Page** (Website → Web Page → New), e.g. title "Daily Review", route `daily`, **Published**, **Full Width**.
2. Paste `web-page.html` into the main section (HTML), `web-page.css` into **CSS** and `web-page.js` into **JavaScript**.
3. Open `https://<your-site>/daily` on a phone while logged in to ERPNext. It opens on yesterday's production day; ‹ › and the date box move between days, and `/daily#2026-10-11` opens a given day.

The viewer needs read access to DRI Production, Weighments, Sales Invoice, Sales Order (and their items).

## Settings (top of `web-page.js`)

`TARGET_MT_MONTH` (15000 → daily target = this ÷ days in month), `TARGET_MW` (14), `SALES_ITEMS` (`['FG-0001']`), `MIN_DOC_VALUE` (₹50,000), `AGE_DAYS` (`[5, 10, 20]`), `DAY_START_HOUR` (6).

## Rules

Same as the dashboard and the PDF: DRI Production drafts count and are flagged; yields follow the DPR; lab values, PF and PLF left at 0 are ignored; a truck counts when its second weighing falls in the 6 AM window; net weight is recorded net or gross − tare; sales use submitted documents of at least ₹50,000 net for the selected items; receivables cover all invoices, days past due as of the next morning. If one area can't be read (e.g. no permission), only its cards show the error.

Tested in a simulated browser against mock ERPNext data (all 16 cards, flipping, phone and desktop layouts); not yet run on the live site.
