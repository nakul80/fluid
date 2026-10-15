import frappe

no_cache = 1


def get_context(context):
    # Only signed-in ERPNext users; everyone else goes to the normal login and comes back.
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/fluid"
        raise frappe.Redirect

    # The page calls the API with the session cookie; POSTs need the CSRF token.
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.boot = frappe.as_json(
        {
            "user": frappe.session.user,
            "default_company": frappe.defaults.get_user_default("Company"),
            "currency": frappe.defaults.get_global_default("currency"),
        }
    )
    frappe.db.commit()
