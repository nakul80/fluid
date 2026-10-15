app_name = "fluid_erp"
app_title = "Fluid ERP"
app_publisher = "NRA"
app_description = "Fast, keyboard-first, Tally-style front end for ERPNext"
app_email = ""
app_license = "mit"
required_apps = ["erpnext"]

# Single-page app: every /fluid/... URL renders www/fluid.html, and the React router takes over.
website_route_rules = [
    {"from_route": "/fluid/<path:app_path>", "to_route": "fluid"},
]

# Show a "Fluid ERP" tile on the /apps screen.
add_to_apps_screen = [
    {
        "name": "fluid_erp",
        "logo": "/assets/fluid_erp/fluid/favicon.svg",
        "title": "Fluid ERP",
        "route": "/fluid",
    }
]
