# sendtelegramfile: sends a file to Telegram (sandbox-safe version).
# Server Script settings:
#   Script Type: API
#   API Method: sendtelegramfile
# Inputs: profile (Telegram Settings name), file_url (a public /files/... URL), caption (optional).
#
# Server scripts can't read files from disk or upload them, so Telegram is given the file's
# public URL and downloads it itself (sendDocument by URL works for PDF, GIF and ZIP, up to 20 MB).
# The site must be reachable from the internet for this.

profile = frappe.form_dict.get("profile")
caption = frappe.form_dict.get("caption") or ""
file_url = frappe.form_dict.get("file_url")

if not profile:
    frappe.response["ok"] = False
    frappe.response["error"] = "Telegram profile is required"

elif not file_url:
    frappe.response["ok"] = False
    frappe.response["error"] = "File URL is required"

elif file_url.startswith("/private/"):
    frappe.response["ok"] = False
    frappe.response["error"] = "Telegram can only fetch public files (/files/...), not " + file_url

else:
    settings = frappe.get_doc("Telegram Settings", profile)

    if not settings.bot_token or not settings.chat_id:
        frappe.response["ok"] = False
        frappe.response["error"] = "Telegram Settings incomplete"

    else:
        try:
            result = frappe.make_post_request(
                "https://api.telegram.org/bot" + settings.bot_token + "/sendDocument",
                data={
                    "chat_id": settings.chat_id,
                    "caption": caption,
                    "document": frappe.utils.get_url(file_url),
                },
            )
            frappe.response["ok"] = bool(result.get("ok"))
            frappe.response["telegram_response"] = result
            if not result.get("ok"):
                frappe.log_error(str(result), "Telegram Document Failed")

        except Exception as e:
            # Telegram's reason (e.g. "failed to get HTTP URL content") is in the error text.
            frappe.response["ok"] = False
            frappe.response["error"] = str(e)
            frappe.response["file_url"] = file_url
            frappe.log_error(str(e), "Telegram Document Failed")
