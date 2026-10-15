# Daily Operations Review: sends yesterday's review PDF to Telegram.
# Server Script settings:
#   Script Type: Scheduler Event
#   Event Frequency: Cron
#   Cron Format: 0 10 * * *      (10:00 every day, after the DRI Production reports are entered)

# Telegram profile, file-sending method and pause switch come from Fluid Settings (/app/fluid-settings).
TELEGRAM_PROFILE = frappe.db.get_single_value("Fluid Settings", "telegram_profile") or "NPSL Purchase"
TELEGRAM_FILE_METHOD = frappe.db.get_single_value("Fluid Settings", "telegram_file_method") or "sendtelegramfile"
PAUSED = frappe.db.get_single_value("Fluid Settings", "pause_daily_review")
PRINT_FORMAT = "Daily Operations Review"

day = frappe.utils.add_days(frappe.utils.nowdate(), -1)

# The review covers every kiln; it is printed from the first kiln's report of the day.
reports = frappe.get_all(
    "DRI Production",
    filters={"production_date": day, "docstatus": ["<", 2]},
    pluck="name",
    order_by="kiln_no asc",
)

if PAUSED:
    pass
elif not reports:
    frappe.log_error("No DRI Production report for " + str(day) + "; daily review not sent.", "Daily Operations Review")
else:
    # Telegram downloads the PDF from the site, so it is saved as a public file just long enough
    # to send, then deleted. The random suffix keeps its URL unguessable while it exists.
    # (frappe.generate_hash isn't available to server scripts, so the database supplies the random part.)
    token = frappe.db.sql("SELECT LEFT(MD5(CONCAT(UUID(), RAND(), RAND())), 16)")[0][0]
    pdf = frappe.get_print(
        "DRI Production", reports[0], print_format=PRINT_FORMAT, as_pdf=True, no_letterhead=1,
        pdf_options={"orientation": "Landscape", "page-size": "A4",
                     "margin-top": "7mm", "margin-bottom": "7mm", "margin-left": "7mm", "margin-right": "7mm"},
    )
    f = frappe.get_doc({
        "doctype": "File",
        "file_name": "Daily-Operations-Review-" + str(day) + "-" + token + ".pdf",
        "is_private": 0,
        "content": pdf,
    }).insert(ignore_permissions=True)
    try:
        args = {
            "profile": TELEGRAM_PROFILE,
            "caption": "Daily Operations Review · " + frappe.utils.formatdate(day, "dd MMM yyyy"),
            "file_url": f.file_url,
        }
        # That script reads its inputs from form_dict, so set them there as well as passing them.
        # (Arguments are spelled out: the server-script sandbox does not support **args.)
        frappe.form_dict.update(args)
        frappe.call(TELEGRAM_FILE_METHOD, profile=args["profile"], caption=args["caption"], file_url=args["file_url"])
    finally:
        frappe.delete_doc("File", f.name, ignore_permissions=True)
