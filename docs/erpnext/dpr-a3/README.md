# Kiln DPR · A3 landscape print format

One kiln per A3 landscape sheet, laid out like the plant's DPR spreadsheet (PRODUCTION · MATERIAL · STOCK / LOGISTICS). `sample-preview.pdf` shows it with made-up data.

## Install

Print Format → New: name e.g. `Kiln DPR A3`, DocType `DRI Production`, **Custom Format** ticked, Print Format Type **Jinja**, paste `kiln-dpr-a3.html` into **HTML**. Open a DRI Production report → Print → this format → **PDF** (A3 landscape comes from the `.print-format` rule; the on-screen preview stays narrow). It reports on that document's kiln, campaign and production date.

## Where each block comes from

| Block | Source |
|---|---|
| CMP No. / CMP Day | `campaign_no`; days with a report in that campaign up to the date |
| Production TDY / MTD / CMP / YTD | `dri_production` (YTD from 1 April) |
| Target (after MTD) | This month's plan target (`ABP_MONTHLY`) × day of month ÷ days in month |
| Target / Actual % (after YTD) | Plan targets of past months in full + this month pro-rata; actual YTD as % of that |
| Quality at cooler discharge | Fe(M) weighted by DRI; `grade_a_hrs` / `grade_b_hrs` and their % (TDY and MTD) |
| Generation | Power MW = `power_kwh` ÷ 24 ÷ 1000 per day; steam TPH = `total_steam` ÷ 24 per day (today / month / FY average) |
| Breakdown details (mins) | `Production Breakdown` rows in the `table_atyf` table: `department` grouped into Ops / Maint. / RMHS / E & I / Other by keyword; `minutes` summed for day / month / campaign / year; the kiln row shows the day's remarks |
| ABP production | Monthly `dri_production` vs `ABP_MONTHLY`; the current month is compared with its pro-rata target (*) |
| Ever best production | Best day, month, FY quarter, FY half and FY year for this kiln, from all its reports |
| Yearly target block | 165,000 target, produced, balance, balance days, required per day, actual per day |
| Raw materials cons. / specific cons. | I/O = `cons_sized_ore`, Pellets = `cons_pellets`, IM coal = `cons_rb2`, DOM coal = ROM (`cons_rom_b` + `cons_rb1`), Wash coal = `cons_washed` (own row), Dolo = `cons_dolomite`; power = `dri_power_consumption`; per MT of DRI |
| ABP spec cons. | Till date = FY to date; targets from `ABP_SPEC` (blank until filled); coal ratio = RB-2 vs all domestic coal (ROM + washed) |
| Store consumption (₹/T) | Same logic as the report **Store Issue Cost Center wise**: stock entry rows issued from a warehouse with a cost centre, excluding item groups Coal and Iron Ore (`STORE_EXCLUDE_GROUPS`), `basic_amount` summed per cost centre; ₹/T = value ÷ (days × 550 MT, `STORE_MT_PER_DAY`). Today = that day; FY = 1 April to that day. Cost centres matched to OPRN / MECH / EEC&EI / QC LAB / CIVIL / CPP by keyword (`STORE_SECTIONS`; unmatched → Other). Sp. Store (ABP) = the FY total |
| Lab blocks (iron ore, pellets, dolomite, coal) | Latest values from the saved report **Quality Query** (the one your current format uses), matched to the row names; blank when that report doesn't exist or `USE_QUALITY_QUERY = False` |
| Dispatch report | Outward weighments (second weighing 6 AM – 6 AM) for TDY / MTD / FY, net MT, matched on item code or item name: DRI lumps FG-0001, char BY-0001 + BY-0004, ESP dust / ash BY-0002 (`DISPATCH`). Plant-level, as weighments carry no kiln |
| Product stock report | Opening / closing = book stock (MT) from the stock ledger at 6 AM on the day and the next day: lumps FG-0001, char BY-0001 + BY-0004 (`PRODUCT_STOCK`) |
| Raw material balancing | Op. stock = stock ledger at 6 AM; Day's recd. = inward weighments 6 AM – 6 AM; Day's cons. = DRI Production, all kilns; Closing = Op. + Recd. − Cons. Items: pellet RM-0003, wash coal RM-0002, DOM coal RM-0001, dolomite RM-0004, RB-2 fines coal CO-0001 (`RM_BALANCE`) |
| Feed loss | Breakdown rows whose remarks mention "injection" or "feed loss" (`FEED_LOSS_WORDS`), listed with minutes, department and remarks, and left out of the breakdown totals |
| Draft | A DRAFT watermark when the document isn't submitted |

## Left blank for now (to come back to)

Shown as "--": feed rate (set `FEED_RATE_FIELD` once known), kiln shutdown details, Sp. Water, ABP spec targets, P/H and TOTAL rows of the product stock report, DRI fines and iron fines (item codes needed), iron ore / RB-1 / RB-2 stock and receipts (item codes needed), and physical stock / difference in the balancing table.

## Settings (top of the file)

`TARGET_MONTH` 15,000 · `TARGET_YEAR` 165,000 · `ABP_MONTHLY` (Apr → Mar: 15,000 a month with August as the maintenance month at 0 = 165,000; move the 0 if maintenance falls in another month) · `ABP_SPEC` targets · `BREAKDOWN_TABLES` (`["table_atyf"]`) · `USE_QUALITY_QUERY` · `FEED_RATE_FIELD` · `STORE_MT_PER_DAY` · `STORE_EXCLUDE_GROUPS` · `STORE_SECTIONS`.

Values are centred; cells without data show "--" (`NA`). Cell padding and alignment are marked `!important` because Frappe's print stylesheet forces `padding: 6px` on table cells, which otherwise pushes the sheet onto two pages.

Tested by rendering against sample data with Jinja's sandbox (SQLite standing in for MariaDB), with Frappe's forced cell padding applied, and printing with Chrome: one A3 page. Not yet run on the live site.
