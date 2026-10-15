# Daily review: stories (ERPNext Web Page)

Full-screen "stories" for one production day (6 AM to 6 AM), made for phones: tap the right side (or swipe left) for the next story, the left side to go back; progress bars on top. Each story is a compact screen with a headline number and small tables. Every figure is compared with the **kiln's current campaign average** and its **previous campaign**; weighbridge and sales (no campaigns) compare with the **month's daily average**. ▲▼ show today's difference, green = better.

`sample-preview.html` is a clickable sample with made-up data (stories work, nothing loads).

| # | Story | Shows |
|---|---|---|
| 1 | Today at a glance | DRI, power, inward, outward, FG-0001 stock, pending orders, receivables overdue; draft warning |
| 2 | DRI production | Total vs daily target; each kiln today vs campaign avg vs previous campaign; MTD vs pro-rata and month target |
| 3+ | One per kiln | DRI/day, pellet & ore yield, "A" grade, sp. coal / iron / dolomite, F.C., sp. power, Fe(M), C, S, non-mag: today vs current and previous campaign |
| | Power plant | Avg MW vs 14, import / export per day, aux %, steam TPH, SSC, PLF, PF: today vs campaign avg vs MTD; by kiln |
| | Where the power went | DRI / aux / export / other shares; running hours by kiln |
| | Campaigns compared | Last 4 campaigns per kiln (● = current, to date): days, MT/day, yield, "A" %, sp. coal, Fe(M), MW, aux %, SSC |
| | Breakdowns | Power plant and DRI breakdowns: count and duration per kiln, and count by department — **today vs current campaign vs all campaigns** (per day); plus the day's remarks |
| | Inward | MT and trucks vs month average; by material → party with TAT |
| | Outward | MT and trucks vs month average; by party |
| | Current stock | One row per material (item name): stock MT (all warehouses), pending orders MT — open Sales Orders for FG-0001, open Purchase Orders (still to receive) for raw materials — and **30DB** = stock + pending − 30 days' consumption (pellet 22,000 · washed coal 15,000 · ROM B 3,000 · dolomite 375 MT, `CONSUMPTION_30D`); negative 30DB in red |
| | Truck turnaround | Avg / median / P90 vs month; distribution; trucks waiting at 6 AM |
| | Pending to deliver | Open FG-0001 orders by customer, late MT |
| | Receivables | Overdue, ageing, most overdue customers (all invoices) |

## Install

1. Website → Web Page → New: title e.g. "Daily Stories", route `stories`, **Published**.
2. Paste `web-page.html` into the main section (HTML), `web-page.css` into **CSS**, `web-page.js` into **JavaScript**.
3. Open `https://<your-site>/stories` on a phone while logged in. It opens on yesterday; ‹ › / the date box change day; `/stories#2026-10-11` opens a given day. The page covers the whole screen (the website header is hidden behind it).

The viewer needs read access to DRI Production, Weighments, Sales Invoice, Sales Order (and their items), Bin, Item and Purchase Order (and its items).

## Settings (top of `web-page.js`)

`TARGET_MT_MONTH` (15000), `TARGET_MW` (14), `SALES_ITEMS` (`['FG-0001']`), `MIN_DOC_VALUE` (₹50,000), `AGE_DAYS` (`[5, 10, 20]`), `DAY_START_HOUR` (6), `HISTORY_DAYS` (400 days of DRI Production read for campaigns), `CAMPAIGNS_SHOWN` (4), `STOCK_PREFIXES` (`['RM']`) and `STOCK_ITEMS` (`['FG-0001']`) for the stock story, `BREAKDOWN_TABLES` (the DRI Production child tables holding breakdowns: `power_plant_breakdown`, `table_atyf`).

## How comparisons work

- A kiln's **current campaign** is the `campaign_no` on its report for the day; its average runs from the campaign's first day up to and including the day (like the DPR's CMP column). The **previous campaign** is that kiln's last campaign that ended before the current one started.
- Per-day amounts (MT/day, MW) are campaign totals ÷ campaign days; ratios (yield, sp. consumption, SSC, aux %) come from campaign totals; Fe(M) / C / S are weighted by DRI.
- Plant-level campaign figures add each kiln's own campaign average for amounts (MW, MWh/day, steam), since kilns run different campaigns.
- **Breakdowns**: the page reads the DRI Production form definition to find the breakdown child tables, their department field and their duration field (hours / minutes / Duration). "All camp." covers every campaign in the history read (`HISTORY_DAYS`). Rates are per day: count ÷ campaign days, per kiln; plant figures add the kilns.
- **Stock** is the current balance from ERPNext (Bin), not as of the report day; pending POs are open Purchase Orders (To Receive / To Receive and Bill), qty − received, in MT.
- Other rules match the dashboard and the PDF (drafts counted and flagged; zero lab values ignored; trucks counted on second weighing; sales ≥ ₹50,000 net for FG-0001).

Tested in a simulated browser against mock ERPNext data with two kilns, four campaigns, breakdown rows and stock balances (all 14 stories, comparisons, tap navigation, phone-width layout); not yet run on the live site.
