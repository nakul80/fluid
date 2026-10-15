# ERPNext reports and pages shipped with Fluid ERP

These records live in the app's `Fluid ERP` module and are created or updated on the site by `bench migrate` (and on install). Nothing needs pasting into ERPNext by hand.

| What | ERPNext record | File in the app | Open it |
|---|---|---|---|
| Business dashboard (Production, Sales, Purchases, Weighments) | Web Page `business-dashboard` | `fluid_erp/fluid_erp/web_page/business_dashboard/business_dashboard.json` | `/dashboard` |
| Daily review, flip cards | Web Page `daily-review` | `fluid_erp/fluid_erp/web_page/daily_review/daily_review.json` | `/daily` |
| Daily review, stories | Web Page `daily-stories` | `fluid_erp/fluid_erp/web_page/daily_stories/daily_stories.json` | `/stories` |
| Daily Operations Review (3-page landscape A4 PDF) | Print Format on DRI Production | `fluid_erp/fluid_erp/print_format/daily_operations_review/daily_operations_review.json` | DRI Production → Print |
| Kiln DPR, A3 landscape | Print Format `Kiln DPR A3` on DRI Production | `fluid_erp/fluid_erp/print_format/kiln_dpr_a3/kiln_dpr_a3.json` | DRI Production → Print |
| Sends the daily PDF to Telegram at 10:00 | Server Script `Daily Operations Review Sender` (Scheduler Event, cron `0 10 * * *`) | `fluid_erp/fluid_erp/server_script/daily_operations_review_sender/` | — |
| Sends a file to Telegram by URL | Server Script `sendtelegramfile` (API, method `sendtelegramfile`) | `fluid_erp/fluid_erp/server_script/sendtelegramfile/` | — |

Each folder here (`dashboard-web-page`, `daily-cards`, `daily-stories`, `daily-report`, `dpr-a3`) keeps the original notes and a sample preview with made-up data. Their "paste into ERPNext" install steps are replaced by the app; the settings, rules and requirements in them still apply.

## Changing one of them

- Web Pages and Print Formats keep their HTML, CSS and JavaScript inside the JSON file (`main_section_html`, `css`, `javascript`; `html` for print formats), as Frappe exports them.
- Server Scripts keep their code in the `.py` file next to the JSON.
- **Bump `modified` in the JSON whenever you change a file.** `bench migrate` only re-imports a record when the file's `modified` is newer than the one on the site.
- The print formats are standard (`standard: Yes`), so ERPNext only lets you edit them on screen in developer mode; change them here instead. To experiment on the site, duplicate one under a new name.

## Before the first migrate

- A record with the same name already on the site (for example a print format you created by hand as `Daily Operations Review`, or a server script named `sendtelegramfile`) is replaced by the app's version.
- Records with a different name are not touched. Delete or disable your hand-made copies so you don't get two pages on the same route (`/dashboard`, `/daily`, `/stories`), two `sendtelegramfile` API scripts, or two daily Telegram sends.
- Server scripts must be enabled on the site (`bench --site <site> set-config server_script_enabled true` on self-hosted benches), and the scheduler must be running. Set `TELEGRAM_PROFILE` at the top of the sender script if it isn't `NPSL Purchase`.
