# Daily Operations Review: PDF to Telegram

Every morning a Server Script sends a three-page landscape daily PDF to Telegram through your `sendtelegramfile` server script. There's no text message. It covers the previous production day (6 AM to 6 AM) and month to date. `sample-preview.pdf` shows the layout with made-up data.

Three landscape A4 pages about one day (6 AM to 6 AM). Month-to-date (MTD) figures appear only as reference in the tiles; monthly analysis will be a separate monthly report.

| Page | Contents |
|---|---|
| 1 Production | DRI tiles: DRI vs daily target, pellet / ore yield, "A" grade, sp. coal (F.C.), sp. iron (sp. dolomite), Fe(M) / C / S / non-mag, sp. power. Power plant tiles: avg MW vs 14, grid import / export, aux %, SSC, steam TPH, PLF / PF, running hours, DM water. This month day by day: DRI vs daily target and avg MW vs 14 MW. DRI by kiln and power plant by kiln for the day. DRI remarks and power plant breakdowns |
| 2 Sales · FG-0001 | Tiles (FG-0001): invoiced day and MTD, average rate, orders booked, pending to deliver, delivery overdue; receivables overdue and oldest overdue (all invoices). The day's FG-0001 invoices by customer. Pending FG-0001 sales orders. Receivables ageing and summary (≥ ₹10 L) |
| 3 Weighbridge | Tiles: weighments, inward / outward MT, avg / median / P90 TAT, pending, TAT unavailable. Inward by material → party, outward by party, TAT distribution |

## Setup

1. **Print Format.** Create a new Print Format:
   - Name: `Daily Operations Review`
   - DocType: `DRI Production`
   - Custom Format: ticked
   - Print Format Type: Jinja
   - HTML: paste `daily-operations-review.html`

   Save, then open any DRI Production report and choose **Print → Daily Operations Review → PDF** to check it. It reports on that report's production date, across all kilns. Landscape is set by a `.print-format { orientation: Landscape; … }` rule in the template (and by `pdf_options` in the script). The on-screen print preview stays portrait; the PDF is landscape.
2. **Server Script.** Create a new Server Script:
   - Script Type: Scheduler Event
   - Event Frequency: Cron
   - Cron Format: `0 10 * * *`
   - Script: paste `send-daily-review.py`

   At the top of the script:
   - Set `TELEGRAM_PROFILE` (the Telegram Settings record to send to).
   - Set `TELEGRAM_FILE_METHOD` to the API Method name of your file-sending server script.
   - Replace that file-sending script with `sendtelegramfile.py` (Script Type: API).

   Set the time to after the DRI Production reports are usually entered.
3. Requirements:
   - Server scripts are enabled (`bench --site <site> set-config server_script_enabled true` on self-hosted sites).
   - The scheduler is running.

To send one immediately, paste the script body into **System Console** and run it.

### Sending

Server scripts can't read files from disk or upload them (no `open`, `import requests` or `frappe.get_site_path`). So the PDF is sent by URL, and Telegram downloads it itself:

1. `send-daily-review.py` renders the PDF and saves it as a **public** file named `Daily-Operations-Review-<date>-<12 random characters>.pdf`.
2. It calls `sendtelegramfile` with `profile`, `caption` and `file_url`.
3. `sendtelegramfile.py` (an API server script that replaces your earlier version) reads the bot token and chat from **Telegram Settings** and calls `sendDocument` with the file's full URL.
4. The file is deleted straight after, whether or not sending worked.

The file is public only for those seconds, and its URL can't be guessed. **Your site must be reachable from the internet** for Telegram to download it. Sending by URL works for PDFs up to 20 MB.

If there's no DRI Production report for the day, nothing is sent and an **Error Log** entry is written ("Daily Operations Review"). Telegram errors are logged as "Telegram Document Failed".

## Settings

The top of `daily-operations-review.html` holds the settings:

- `COMPANY`
- `TARGET_MT_MONTH` (15000)
- `TARGET_MW` (14)
- `SALES_ITEMS` (`["FG-0001"]`), `MIN_DOC_VALUE` (₹50,000, as on the dashboard), `MIN_OUTSTANDING` (₹10 L), `AGE_DAYS` (`[5, 10, 20]`)
- `DAY_START` (`06:00:00`)

## How figures are worked out

- **Production:** draft and submitted DRI Production reports count, cancelled reports don't. Slide 1 flags any reports still in draft.
- **Daily target:** 15,000 ÷ days in the month. The month-to-date target is pro-rata. Bars are amber when below target, and the current month is judged against its pro-rata target.
- **Yield:** pellet and iron ore yield follow the DPR and the dashboard: DRI produced on days that feed was charged ÷ that feed.
- **Lab and meter values:** Fe(M), C and S are weighted by DRI, non-mag by char, and F.C. by coal tonnage. Lab values and power or load factors left at 0 are treated as not recorded.
- **Weighbridge:** a truck counts when its second weighing falls between 6 AM on the day and 6 AM the next day. Net weight uses the recorded net, or gross − tare if net is 0.
- **Sales:** submitted invoices only, net of tax. MT comes from the stock UOM (Kg, Quintal, MT/Tonne). "Overdue" means past due date as of the morning the report is sent.

## Tested / not tested

- **Tested:** I dry-ran the sending script with mocks. I rendered the template locally with Jinja's sandbox against sample data (SQLite standing in for MariaDB) and printed it with Chrome. All three pages render and fit one landscape A4 sheet each, and the totals cross-check.
- **Not tested:**
  - On your ERPNext site, nothing has run yet.
  - The site's PDF engine: most sites use wkhtmltopdf, whose layout can differ slightly from Chrome's.
  - The ₹ sign needs a font on the server that includes it.
- **Field names** come from your DPR print formats and the dashboard. If one differs, the print preview shows the error.
