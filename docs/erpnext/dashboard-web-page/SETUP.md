# Business dashboard — Sales, Purchases, Weighments, Production

Replace all three sections on your existing ERPNext Web Page:

1. **Main Section / HTML**: paste `web-page.html`.
2. **CSS / Style**: paste `web-page.css`.
3. **JavaScript / Script**: paste `web-page.js`.
4. Tick **Full Width** on the Web Page so the dashboard can use the whole screen.
5. Save and reload. If the old version persists, clear the website cache or hard-refresh.

`dashboard-preview.html` is a local copy for checking layout; it cannot read data from a file.

## Layout

A left sidebar switches between **Production**, **Sales**, **Purchases** and **Weighments** (links `#production`, `#sales`, `#purchases`, `#weighments` can be bookmarked). The dashboard opens on the first page in the sidebar (Production) when no link is given; reorder the `<a>` tags in the HTML to change that. One filter row sits on top:

- **From / To** default to the current financial year (1 April – 31 March). Clear them to see all dates.
- **Company** appears only when the data contains more than one company.
- Sales: Customer, Material. Purchases: Supplier, Material. Weighments: Movement, Party, Material. Production: Kiln.
- Material dropdowns list actual item names under SPONGE / PELLET / COAL / TMT / OTHER headings, each with an "All <group>" option.

Each page loads the first time it is opened; **Refresh** re-reads the current page. Changing dates reloads Sales, Purchases and Production from ERPNext; Weighments filters dates in the browser.

## Sales and Purchases

Sources: Sales Invoice + Sales Order, and Purchase Invoice + Purchase Order, with their item tables. Only submitted documents count.

- **Cards**: invoiced value and MT, average ₹/MT, orders booked, pending to deliver/receive, outstanding, overdue, oldest overdue.
- **Monthly value**: invoiced vs ordered, net of tax, by posting / order date.
- **Ageing**: today's outstanding across all dates, bucketed by days past due date.
- **Tables** (each with CSV export). On screens about 1,200px wide or more (dashboard area), tables pair up two to a row: Sales shows pending SO summary beside receivables summary, then by customer full width; Purchases shows the wider pending PO summary full width, then by supplier beside payables summary. Narrower screens stack them.
- **Pending SO / PO summary**: open orders (any date). On Sales only item `FG-0001`, listed by customer with a total row (no material subtotals or item column, since it is one item) (`PENDING_SO_ITEMS` in the script; matched on item code or item name, ignoring case, spaces and leading zeros, so FG-001 and FG-0001 both match; if nothing matches, the table lists the item codes found on open orders), grouped by material group (SPONGE, PELLET, COAL, TMT, OTHER) with a subtotal row per group and a grand total; within each group, rows by customer/supplier × item, customer/supplier, or item. Groups and rows are sorted by pending value. Columns: oldest order, earliest due, ordered / delivered (received) / pending MT, overdue pending MT, pending ₹. On Purchases, **Raw Material items only** (on by default) limits it to items in the `Raw Material` item group and all its sub-groups, read from the Item Group tree (falls back to group names containing "Raw Material" if the tree can't be read).
- **Receivables / payables summary**: today's outstanding per customer/supplier (any date) with ageing buckets by days past due — Sales: not due, 1–5, 6–10, 11–20, > 20; Purchases: not due, 1–30, 31–60, 61–90, > 90 (`ageDays` in the script); the ageing chart uses the same buckets, oldest overdue days and a total row, largest first. Parties with under ₹10,00,000 outstanding either way (`MIN_OUTSTANDING`) are hidden; a note under the table gives their count and amount, and the Total row covers the listed parties.
- Long customer / supplier names are shortened with … (full name on hover).
- All tables show their Total row at the top. Performance tables (by customer / supplier, weighment performance) list the top 20 (`TOP_N`) plus a Total row covering everything loaded; use the filters to look at a smaller party.
- To keep loading light, invoices and orders under ₹50,000 net (`MIN_DOC_VALUE`) are filtered out by ERPNext before loading (returns too), and Weighments loads only the From–To range (the daily summary reads just its chosen day). Outstanding / ageing still reads every unpaid invoice (header rows only, no item lines).

Rules:

- Money is shown in ₹ crore (2 decimals) in cards and tables; amounts under ₹1 lakh show in rupees.
- Values are item net amounts in company currency (`base_net_amount`), before taxes. Returns and debit/credit notes reduce them.
- MT comes from each line's `stock_qty` and `stock_uom`: Kg ÷ 1000, Quintal ÷ 10, MT/Tonne as is. Lines in other UOMs (Nos, etc.) are left out of tonnage and ₹/MT, and the card says how many.
- Pending = ordered − delivered (sales) or − received (purchases), on orders with status To Deliver (and Bill) / To Receive (and Bill), any date.
- Outstanding and ageing ignore the date and material filters. Negative outstanding (credit notes, advances) reduces the total but never counts as overdue.
- Material group comes from the item name, then the item group.

## Weighments

Unchanged logic: all movements, KG → MT, TAT between first and second weighing, pending trucks carry no weight, gross − tare fallback when net is missing or zero. The monthly chart shows truck count; hover a month for MT. Instead of a full weighment list, a **daily inward & outward summary** covers trucks whose second weighing falls between 6 am yesterday and 6 am this morning (`DAY_START_HOUR`), read from ERPNext separately; there is no date picker, and Refresh rolls it over. A truck counts when its second weighing is done, even if its first weighing was days earlier; pending trucks are left out. It is shown above the performance table: inward and outward side by side. Inward has a heading row per material (with its subtotals) and its parties indented below; outward lists parties only (single finished item). Both show trucks, net MT, average TAT and a total row, largest net MT first. The inward CSV keeps a Material column on every row. Movement values are matched as "Inward" / "Outward" ignoring case.

## Production

Source: submitted **DRI Production** reports whose production date falls between From and To (drafts and cancelled reports are left out). The Kiln filter narrows everything on the page. Each row pairs the DRI plant (left) with the power plant (right).

- **DRI plant cards**: DRI production and MT/day, latest day vs average, pellet and iron ore 10–40 yield, "A" grade %, specific coal (with average F.C.), specific iron/pellets (with specific dolomite), specific power, DRI Fe(M) with C and S.
- **Power plant cards**: average MW generated, grid import (and export), auxiliary consumption %, SSC (t steam to turbine per MWh), steam TPH, plant load factor and power factor, TG / WHRB / DG running hours per day, DM water used and produced (KL/hr).
- **Monthly charts**: DRI production MT with a dashed **15,000 MT** monthly target (`MONTHLY_TARGET_MT`) | power as daily average MW generated vs imported, with a dashed **14 MW** target (`AVG_MW_TARGET`). Hover shows % of target.
- **Breakdown charts**: raw material per MT of DRI | where the power went (DRI plant, power plant auxiliary, export, other/unaccounted).
- **Kiln performance | Power plant performance**: by kiln, with an All kilns row. Click a kiln to filter.
- **Campaigns | Power plant by campaign**: each kiln campaign within the range, latest first.
- Calculations follow the DPRs: yield = DRI produced on days that material was charged ÷ material consumed; "A" grade % from A and B hours; specific consumption = consumption ÷ DRI; coal = RB2 (imported) + washed + ROM B + RB1 (domestic), F.C. weighted by tonnage; Fe(M), C, S weighted by DRI, non-mag by char; SSC = steam to turbine ÷ MWh generated. Lab values, power factor and plant load factor left at 0 are treated as not recorded. Targets apply as-is when a single kiln is selected.
- This page does not replace the printed DPRs (no campaign-to-date / YTD per report, no remarks or breakdown rows).

## Requirements and limits

- The viewer needs read permission on Sales Invoice, Sales Order, Purchase Invoice, Purchase Order (and their items), Item Group, Weighments and DRI Production. A page the viewer cannot read shows a permission message; other pages still work.
- Reads use the standard `frappe.client.get_list` API in the logged-in user's session. Item rows are fetched 80 invoices/orders per request.
- Everything loads into the browser. Tens of thousands of invoices per year are fine; much larger volumes need a server-side report.
- Tested locally against a mocked ERPNext with sample invoices, returns, orders, outstanding credits and weighments; **not yet run on your live site**.
