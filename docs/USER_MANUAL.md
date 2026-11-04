# Dyna-Serv WIMS — User Manual

**Document type:** Operational user guide  
**System:** Dyna-Serv Warehouse Inventory Management System (WIMS)  
**Version:** 2.1
**Evidence baseline:** Implemented routes, components, approved specifications, and recorded verification inspected 2026-11-04
**Audience:** Administrators, supervisors, warehouse staff, organization users, and trained operational users

> This manual describes repository-supported operating procedures, not proof that every feature or database change is live in your deployment. Work through the actions visible to your signed-in account. A planned feature, an unconfigured service, and a missing permission require different remedies.

For focused procedures, use the [companion guide library](user-manual/README.md). For deployment, database, permission, and support internals, use [System Documentation](System_Documentation.md). All organization names, codes, quantities and document references in examples are training examples.

**How to use this manual:** read Sections 1–4 once, then open the chapter for your task. Major procedures explain who performs the work, what must be ready, what to enter, what success means, and how to recover. Section 15 joins the individual procedures into complete user cases. Section 16 covers interrupted work and recovery.

## Contents

1. [Getting started](#1-getting-started)  
2. [Understanding the interface](#2-understanding-the-interface)  
3. [Roles and daily responsibilities](#3-roles-and-daily-responsibilities)  
4. [Dashboard and navigation](#4-dashboard-and-navigation)  
5. [Receiving](#5-receiving)  
6. [Inventory and master data](#6-inventory-and-master-data)  
7. [Picking and dispatch](#7-picking-and-dispatch)  
8. [Migration](#8-migration)  
9. [Reports and analytics](#9-reports-and-analytics)  
10. [Billing and pricing](#10-billing-and-pricing)  
11. [Documents Center](#11-documents-center)  
12. [QR codes and scanning](#12-qr-codes-and-scanning)  
13. [Organization portal](#13-organization-portal)  
14. [Settings and account](#14-settings-and-account)  
15. [End-to-end tutorials](#15-end-to-end-tutorials)  
16. [Errors and troubleshooting](#16-errors-and-troubleshooting)  
17. [FAQ, glossary, and quick reference](#17-faq-glossary-and-quick-reference)  
18. [User Manual appendices](#18-user-manual-appendices)  
19. [2026-11-04 implementation and verification audit](#19-2026-11-04-implementation-and-verification-audit)
20. [Coverage checklist and revision history](#20-coverage-checklist-and-revision-history)

**Visual references:** the page/component catalog, form-field reference, QR decision table, exception matrix, and Appendix A screenshot manifest are the operational visual-reference index. Final annotated screenshots remain UAT evidence and are not fabricated from source inspection.

The detailed operating guides below are maintained companions to this manual. They are not separate sources of truth; when a rule changes, update this manual and the companion chapter together.

| Companion guide | Use it for |
|---|---|
| [Incoming receiving and WRR](user-manual/incoming-receiving-and-wrr.md) | CIPL/pre-alert intake, line-by-line receiving, putaway, shortages, holds, and WRR closure |
| [Inventory and withdrawals](user-manual/inventory-and-withdrawals.md) | Inventory models, SPQ/loose-unit rules, stock history, and withdrawal initiation |
| [Outgoing picking and dispatch](user-manual/outgoing-picking-and-dispatch.md) | Two-stage commitment, FIFO/FEFO allocation, physical picking, gate scans, and dispatch |
| [Master data and organizations](user-manual/master-data-and-organizations.md) | Parties, item enrollment, origin organization, inherited inventory model, and locations |
| [Document printing and compliance](user-manual/document-printing-and-compliance.md) | Print layouts, signatures, reprints, pricing disclaimers, and document retention |
| [Accounts, roles, and access](user-manual/accounts-roles-and-access.md) | Manage custom permission bundles, assign account roles, and review access safely |
| [Edge cases and troubleshooting](user-manual/edge-cases-and-troubleshooting.md) | Exception handling, recovery actions, and escalation evidence |

## 1. Getting started

### 1.1 What WIMS is for

WIMS helps the warehouse know what stock exists, who owns it, where it is, what documents support it, what is arriving, what is being picked, and what has been dispatched. It supports VMI stock, trading/3PL stock, and internal supplies.

### 1.2 Devices and browsers

- Use a desktop browser for administration, forms, reports, documents, billing, migration, and configuration.
- Use a supported mobile browser or handheld device for receiving, floor scanning, picking, and dispatch.
- Camera scanning requires browser camera permission and a device with a usable camera.
- If camera scanning is unavailable, use the manual search/entry fallback where the screen provides it.
- Thermal-label printing depends on the browser print dialog and the configured printer/driver.

### 1.3 Sign in and sign out

1. Open the **Dyna-Serv Global Corporation** WIMS application URL.
2. Enter the credentials supplied by your administrator.
3. Complete the authentication step.
4. Confirm that the dashboard and expected navigation are visible.
5. To sign out, use the account/profile control and choose **Sign out**.

Never share a session or leave a floor device signed in unattended. If the session expires, sign in again and verify the last operation before repeating it.

### 1.4 First-time orientation

The left/sidebar navigation is the office pattern. Floor screens use a simplified floor presentation and larger touch controls. The mobile interface may show cards instead of tables. A hidden menu item usually means the account lacks its capability; it is not a display error by itself.

### 1.5 Account and password procedures

The application uses the configured Supabase authentication flow. Use the sign-in page and the account/profile controls provided by the deployment. Never enter credentials into a shared screenshot, support ticket, migration workbook, or document attachment.

- If the session expires, sign in again, then verify the last record status before repeating a mutation.
- If the account is invited but not activated, use the invitation acceptance page if supplied by the administrator.
- Profile and security settings are separate from operational role permissions. Changing a profile field does not grant access.
- Password-reset availability depends on the deployed authentication configuration and is not asserted here as an application workflow unless the link is visible on the sign-in screen. Contact the administrator if it is absent.
- A suspended/deactivated account must be re-enabled by an authorized administrator; do not create a duplicate account to bypass the state.

## 2. Understanding the interface

### 2.1 Shared controls

| Control | Purpose | Expected behavior |
|---|---|---|
| Search field | Find an item, lot, document, party, report, or location | Type a meaningful code/name, then wait for results or press Search where provided |
| Organization filter | Restrict records to an organization/party | Select a permitted organization; material enrollment restricts origin options by role |
| Date From/To | Restrict a report/document range | Use the same date format shown by the control; leave blank for all permitted dates |
| Select/dropdown | Choose one approved value | The inherited or disabled state explains why a choice is unavailable |
| Tabs | Change the active work area | The active tab is underlined/highlighted; tab changes do not necessarily submit data |
| Status badge | Explain current record state | Status is informational unless an action is shown for that state |
| Primary button | Perform the next important action | Read confirmation text; do not double-click mutation buttons |
| Modal | Preview, confirm, or edit without leaving the page | Close only after saving or canceling intentionally |
| Pagination | Change the visible page of a list | Counts and page controls describe the current result set |
| Card | Mobile representation of a table row or summary | Read field labels in the card; no horizontal scrolling should be required for normal use |

### 2.2 Desktop and mobile patterns

Desktop uses wider filter rows, multi-column forms, tables, sidebars, and office actions. Mobile uses stacked fields, touch-sized actions, cards in place of wide tables, a bottom/floating floor navigation pattern, and scanner-first workflows. Desktop administration uses search rather than camera scanning; mobile floor workflows may show scan first with manual search fallback.

### 2.3 Status language

Do not treat all statuses as interchangeable. A WRR status, lot status, pick-list status, approval status, billing-period status, and document status belong to different workflows. Use the status shown on that screen and follow the action offered for it.

### 2.4 Page and component reference

| Page/screen | Main visible areas and components | What the user does there |
|---|---|---|
| Dashboard | Queue cards, KPI cards, stock valuation, health/QC, refresh/export actions | Triage the next operational task |
| Receiving list | Search/filter bar, WRR table/cards, status and actions | Find, open, or create a receiving record |
| New WRR | Header form, CIPL import, line repeater, organization/model selects, attachments | Stage an inbound document and its expected lines |
| WRR detail | Header summary, tabs, line cards/table, CIPL links, QR/unit-label actions | Review shipment and choose the next receiving action |
| WRR receive | Scanner bridge, scan feedback, discrepancy modal, putaway selector, Store/Hold action | Reconcile physical stock and commit placement |
| Inventory Stock View | Search, organization/model filters, item cards/table, expandable lot cards, lot QR viewer | Find current stock and lot/location detail |
| Inventory Pick Lists | Draft form, organization/recipient/model fields, import DRA, line cards/table, queue tabs | Build and review a pick list |
| Inventory Inspection | Inspection/transfer queue cards/table, status badges, detail links | Start or review inspection work |
| Outgoing | Pick queue, logistics/outgoing ledger tables/cards, filters and actions | Monitor outgoing work |
| Pick screen | Pick checklist, quantity progress, floor actions, scanner/manual fallback | Select physical cartons |
| Dispatch screen | Barcode field/scanner, selected-count checklist, discrepancy client, receipt link | Verify and finalize dispatch |
| Documents Center | Document-family tabs, search/organization/date controls, previews, downloads/reprints | Find and manage authoritative artifacts |
| Reports | KPI cards, charts/heatmaps, VMI/trading sections, report archive, filters/exports | Analyze operations and export results |
| Billing & Pricing | Overview, VMI contracts/periods/permits, trading policies, rate matrices, SOA | Configure and review financial records |
| Enrollment | Classification hierarchy, organization/model fields, item/party/location forms, map view | Create or update master data |
| Migration | Upload/stage/review/approve/commit workflow, exception queue, previous stages | Seed opening inventory safely |
| Master Data | Item, location and party directories; detail/edit/deactivate forms; bulk location generator | Maintain canonical references |
| Approvals | Approval filters/table, detail view, decision controls | Review and decide authorized requests |
| Portal | Party dashboard, inventory, orders, documents | Work within organization scope |
| Profile/Settings | Profile, general, security, team and preference forms | Maintain account and authorized system settings |

Component names are implementation references for support/training: `FilterSearchInput`, `FilterSelect`, `FilterDateInput`, `MobileTableEnhancer`, `MobileDataCard`, `LotQrViewer`, `WRRUnitLabelGenerator`, `MobileQRScanner`, `ScanFeedbackProvider`, `DocumentPreviewModal`, `PutawayLocationSelector`, `PickListInteractiveChecklist`, and the shared `components/ui` controls.

### 2.5 Complete page and subpage catalog

Use this catalog when a trainer says “open the page.” Bracketed segments are record IDs; query tabs change the work area without changing the underlying module.

| Page | Screen/subpage | Primary controls | Result or next page |
|---|---|---|---|
| Dashboard `/` | Office landing | KPI/queue cards, refresh, export, activity/heatmap sections | Opens the authoritative queue or report |
| Dashboard `/` | Floor landing | Inbound/outbound primary actions, scan/search entry, health cards | Opens floor receiving, picking, or dispatch |
| Receiving `/receiving` | WRR directory | Search, organization/date/status filters, create, open | WRR detail or new WRR |
| Receiving `/receiving/new` | New WRR | Header fields, CIPL import, line repeater, attachment, save | Staged WRR detail |
| Receiving `/receiving/[wrrId]` | WRR detail | Summary, tabs, line actions, edit, pre-alert, print, receive | Receive, receipt, or print route |
| Receiving `/receiving/[wrrId]/pre-alert` | Pre-alert view | Review source notice and confirmation actions where granted | WRR workflow or review state |
| Receiving `/receiving/[wrrId]/edit` | Edit WRR | Editable header/line values while status permits | Updated WRR detail |
| Receiving `/receiving/[wrrId]/receive` | Floor receiving | Scanner, manual fallback, feedback, discrepancy, putaway selector, Store/Hold | Line commit and WRR progress |
| Receiving `/receiving/[wrrId]/print` | WRR print | Print preview/action and document header | Printed WRR artifact |
| Receiving `/receiving/[wrrId]/receipt` | Receipt view | Review/download/print | Documents/print output |
| Inventory `/inventory` | Stock View | Search, organization/model filters, item/lot/location cards, export | Item detail/lot QR |
| Inventory `/inventory?tab=pick-lists` | Pick Lists | Recipient/model fields, DRA import, line draft, generate | Pick-list queue/detail |
| Inventory `/inventory?tab=inspection` | Inspection tab | Inspection queue, status/details, start action | Inspection detail/resolution |
| Inventory item modal | Item detail | Specifications, lots/locations, movement history, lot QR | Return to stock view or scan/print |
| Pick lists `/pick-lists` | Directory | Search/filter, open/edit/print | Pick-list detail |
| Pick list `/pick-lists/[pickListId]/pick` | Pick checklist | Item/lot/location progress, scanner/manual confirmation, discrepancy | Picked state or correction |
| Pick list `/pick-lists/[pickListId]/dispatch` | Dispatch gate | Scan field/scanner, selected count, discrepancy client, confirm | Dispatch and acknowledgement receipt |
| Pick list `/pick-lists/[pickListId]/edit` | Edit pick list | Review/edit eligible draft fields and lines | Updated pick list |
| Pick list `/pick-lists/[pickListId]/print` | Pick-list print | Print operational picking document | Floor pick evidence |
| Pick list `/pick-lists/[pickListId]/receipt` | Receipt | View/download/print receipt | Documents archive |
| Outgoing `/outgoing` | Logistics queues | To-pick/to-dispatch filters, ledger tables/cards, open actions | Pick or dispatch screen |
| Documents `/documents` | WRRs & Receipts | Search, organization/date controls, family-specific actions | Preview/download/reprint |
| Documents `/documents` | CI/PL & Invoices | Search, organization/date controls, family table | Preview/download |
| Documents `/documents` | Pick Lists & DRA | Search and family actions | Preview/download |
| Documents `/documents` | Delivery Receipts | Search and family actions | Preview/download/reprint |
| Documents `/documents` | SOA | Search and period/party actions | SOA preview/download |
| Documents `/documents` | Reports & Audit Logs | Search, category/format filters, archive table | Report preview/download |
| Reports `/reports` | Reports hub | Report tabs, KPI cards, date/organization filters, export/print | Report section/modal/PDF |
| Billing `/billing-pricing` | Overview/configuration | Navigation, rate/configuration controls | Contract, VMI, trading, or SOA area |
| Billing `/billing-pricing/contracts` | Contract directory | Search/filter, create/open | Contract detail/version/rules |
| Billing `/billing-pricing/contracts/new` | New contract | Party, type, dates, currency, terms | Contract detail |
| Billing `/billing-pricing/contracts/[id]` | Contract detail | Header, pricing rules, rate cards, version history | Rule/version editor |
| Billing `/billing-pricing/vmi` | VMI overview | Contract/period/permit navigation | VMI subpage |
| Billing `/billing-pricing/vmi/contracts` | VMI terms | Party/rate fields, terms modal | Saved VMI configuration |
| Billing `/billing-pricing/vmi/permits/[partyId]` | Permit detail | Permit/item scope/date/fee fields | Permit record |
| Billing `/billing-pricing/vmi/periods` | Period directory | Party/status/date actions | Period detail |
| Billing `/billing-pricing/vmi/periods/[periodId]` | Period detail | Charges, correction, issue, payment, close, redeliver | Locked/issued/paid period artifacts |
| Billing `/billing-pricing/soa` | SOA directory | Party/period/status controls | SOA detail |
| Billing `/billing-pricing/soa/[id]` | SOA detail | Lines, balance, document actions | SOA artifact |
| Billing `/billing-pricing/trading/policies` | Trading policies | Policy filters and edit modal | Trading policy state |
| Enrollment `/enrollment` | Enrollment hub | Classification, party/item/location choices, map/sample actions | Enrollment form or map |
| Master Data `/master-data/items` | Item directory | Search/status/actions | Item detail/edit/new |
| Master Data `/master-data/items/new` | New item | Classification, origin organization, inherited model, identifiers, packaging, prices | Item record |
| Master Data `/master-data/items/[itemId]` | Item detail | Specification, status, related data | Edit/deactivate |
| Master Data `/master-data/items/[itemId]/edit` | Edit item | Editable catalog fields and active state | Updated item record |
| Master Data `/master-data/locations` | Location directory | Search/filter, new, bulk | Location detail/form |
| Master Data `/master-data/locations/new` | New location | Zone/rack/level/position/type/capacity | Location record |
| Master Data `/master-data/locations/[locationId]/edit` | Edit location | Location identity/capacity/status | Updated location record |
| Master Data `/master-data/locations/bulk` | Bulk generator | Zone/rack/level/position/capacity inputs | Generated location review |
| Master Data `/master-data/parties` | Party directory | Search/status/actions | Party detail/edit/new |
| Master Data `/master-data/parties/new` | New party | Party identity/contact/role fields | Party record |
| Master Data `/master-data/parties/[partyId]/edit` | Edit party | Party identity/contact/active-state fields | Updated party record |
| Migration `/migration` | Upload/stage/review | Workbook upload, validation, exception resolution, approve/commit | Migration success or correction |
| Migration `/migration/success` | Result/reconciliation | Counts, lot QR bulk print, carton QR bulk print, pending resolution | Inventory/labels |
| Approvals `/approvals` | Queue | Status/search/filter | Approval detail |
| Approvals `/approvals/[approvalId]` | Decision detail | Evidence, approve/reject, reason | Updated approval/policy workflow |
| Inspection `/inspection` | Inspection queue | Filters, open case | Inspection detail |
| Inspection `/inspection/[id]` | Resolution | Evidence, disposition, remarks, submit | Released/held/rejected stock |
| Transfers `/transfers` | Transfer directory | Search/status/open | Transfer detail |
| Transfers `/transfers/new` | New transfer | Source/destination, lines, quantities | Transfer detail/execute |
| Transfers `/transfers/[transferId]` | Transfer detail | Summary, status, execute/inspect actions | Execution or inspection |
| Portal `/portal` | Party landing | Scoped dashboard cards | Party inventory/orders/documents |
| Portal `/portal/inventory` | Party inventory | Search/filter/export | Scoped inventory detail |
| Portal `/portal/orders` | Party orders | Search/filter/open | Scoped order detail |
| Portal `/portal/documents` | Party documents | Search/filter/download | Scoped artifact |
| Profile `/profile` | Account tabs | Account, preferences, security | Saved personal settings |
| Settings `/settings` | Settings shell | General/security/team tabs | Administrative settings |
| Settings `/settings/general` | General settings | Organization/system preference fields | Updated general settings |
| Settings `/settings/security` | Security settings | Security controls and audit/security actions | Updated security settings |
| Settings `/settings/team` | Team management | Invite, role, suspend, audit actions | Updated user/team state |
| Auth `/login` and `/accept-invite` | Authentication/invitation | Sign in or accept an administrator invitation | Authenticated session or activation result |

The registry also contains `/portal/notifications` and `/portal/labels` as planned entries. They are not current user workflows unless the deployment exposes them.

### 2.6 Form-field reference

The labels below describe the current operational meaning. Required markers and enabled/disabled states shown by the form take precedence for the current record state.

| Form | Field | Meaning and entry rule |
|---|---|---|
| New WRR header | Organization/material origin | Party named by the inbound source document; do not choose a convenient substitute |
| New WRR header | Flow/inventory model | Trading, VMI, or Supplies flow governing quantity, ownership, and pricing behavior |
| New WRR header | Commercial invoice/CIPL, PEZA, IP, MAWB/MBL | Shipping/customs references; attach the source document where the form permits |
| WRR line | Item/DSGC/customer code | Match the catalog item and source-document identifiers; unresolved items block safe receiving |
| WRR line | Lot number | Supplier/business lot identity; it is not the same as a QR unit ID |
| WRR line | Manufacture/expiry date | Source dates; expiry is required when the item is perishable |
| WRR line | Expected quantity/UOM/unit CBM | Declared inbound quantity, measurement unit, and volume basis |
| WRR line | Disposition | Store or inspect/hold; follow the discrepancy path for damaged or non-conforming stock |
| Enrollment | Material-origin organization | In this workflow, only supplier and VMI-customer role parties are selectable |
| Enrollment | Inventory model (inherited) | Derived from the selected origin organization; not a free choice when the form marks it inherited |
| Enrollment | Category/type/subcategory | Catalog hierarchy and finished-goods/raw-material classification |
| Enrollment | UOM/SPQ/dimensions/CBM | Packaging and volume data used by quantity and capacity rules |
| Pick list | Recipient/end customer | Destination party; VMI releases may require downstream recipient information |
| Pick list | Item/lot/location/quantity | Exact allocation request; Trading/VMI quantity follows SPQ rules |
| Pick list | DRA | Optional source import where enabled; parsed lines remain reviewable before generation |
| Dispatch | Scan evidence/count | Physical proof that the required lot/carton selection has been verified |
| Migration | Workbook/profile | Source structure selected for the approved migration; do not rename source codes casually |
| Migration | Exception category/note | Explanation and resolution for an allowed warning; blocking exceptions must be corrected |
| VMI period | Date range/party/rates/charges | Period billing basis; review before issue/close |
| Trading policy | Effective dates/rates | Commercial pricing behavior; document prices may be frozen at transaction time |
| Documents | Search/organization/date/family | Filters the active document family; there is no universal status vocabulary across all tabs |

## 3. Roles and daily responsibilities

| Role | Typical work | Main restrictions |
|---|---|---|
| Administrator | User/team setup, master data, migration, rates/contracts, documents, reporting, approvals | High-impact actions are still permission-checked and audited |
| Supervisor | Review exceptions, approvals, receiving/inspection oversight, reports, financial review | Cannot perform capabilities not assigned by RBAC |
| Warehouse staff | Scan/receive, inspect, put away, pick, dispatch | No administrative/migration/financial configuration unless separately granted |
| Organization user | View permitted inventory/orders/documents through portal | Party scope prevents access to other organizations |

Your exact access is determined by assigned grants. If this table says a task is typical but the button is absent, contact the administrator rather than attempting a direct URL.

### 3.1 Role-by-role operating guides

#### Administrator

Use the office desktop layout for team/RBAC, master data, migration, billing configuration, documents, and system settings. Administrators may still be blocked from a capability that is not assigned to the account. Before a high-impact action, record the affected party/record, reason, and expected result. Afterward verify the audit/document/inventory result rather than relying only on a success toast.

Daily checklist: review dashboard queues; resolve receiving/inspection/approval exceptions; check low-stock/quarantine; review migration or master-data work; confirm billing/document jobs; review security/team notifications.

#### Supervisor

Use the approvals, inspection, receiving, outgoing, reports, and financial-read surfaces assigned to the account. Supervisors approve exceptions using the evidence in the request and must not approve their own request. For discrepancies, preserve the original record and use the correction/inspection workflow.

Daily checklist: review open exceptions and expiring commitments; approve/deny valid overrides; review shortages and quarantine; confirm dispatch and report anomalies; escalate unresolved data quality issues.

#### Warehouse staff / floor operator

Use a mobile/handheld floor surface. Scan first, then use manual fallback when camera scanning is unavailable. Work only the WRR/pick list/transfer shown by the screen; do not select a substitute lot or location without the provided authorization path. Confirm physical quantity and location before Store, Hold, Pick, or Dispatch.

Daily checklist: open assigned queue; verify device/connectivity; receive/put away; perform inspection/pick/dispatch tasks; report shortages/damage; sign out or lock the shared device.

#### Organization/party user

Use the portal within the party scope granted by the account. Review only the organization's inventory, orders, and documents. Do not expect access to internal receiving, warehouse-wide stock, other parties, billing configuration, or administrator settings.

Daily checklist: review scoped inventory/orders/documents; download permitted artifacts; report a source-document or quantity discrepancy with the record reference.

### 3.2 Permission troubleshooting

| Symptom | Meaning | Correct response |
|---|---|---|
| Navigation item absent | The route is not in the current account's visible capability set | Ask an administrator to verify role/grant and deployment status |
| Page opens but action is absent | Read access exists, mutation capability does not | Request the specific action grant; do not use a direct URL as a workaround |
| Record is hidden | Party scope, status, or filter excludes it | Clear filters and verify party scope; escalate if the record should be visible |
| Action returns forbidden | Server-side authorization rejected the mutation | Stop; capture route/record/message and request review |
| Financial page unavailable | Financial reporting/configuration capability is missing | Ask for the appropriate reporting/financial grant |

## 4. Dashboard and navigation

### 4.1 Find the right work area

Start at the Dashboard after signing in. A queue count tells you which records need attention; it is not proof that all of them are ready for the next physical action. An open WRR still needs source-document and quantity checks. A reserved pick list still needs its required review and physical verification.

The main work areas include **Receiving**, **Master Inventory**, **Outgoing**, **Approvals**, **Documents**, **Reports & Analytics**, **Data Management**, **Billing & Pricing**, and account/settings pages. Your permissions determine which appear. Master Inventory groups stock lookup, pick-list preparation, inspection and stock-count work.

1. Open the relevant queue or work area.
2. Confirm the active tab, Organization, Inventory Model, date range and status filters.
3. Search for the document/item reference supplied by the person handing over the work.
4. Open the record and read its current status before choosing an action.
5. After success, return to the queue and check that the record moved to its expected state.

Counts can change while another operator works. Refresh the authoritative queue before reporting a mismatch. Do not recreate a transaction just to make a dashboard total change.

### 4.2 Use the draggable mobile navigation sheet

On a narrow screen, open the menu or **More** control supplied by the shell. The sheet shows the signed-in identity, grouped links and a close control.

- Drag the small top handle upward to expand the sheet.
- Drag it downward to reduce its height; pull it far enough down to close it.
- Release the handle to let the menu settle at a compact, normal or expanded height.
- Swipe **inside the list** to reach lower links. Scrolling the list and dragging the handle are separate gestures.
- Tap **×** or the shaded area outside the sheet to close it without choosing a destination.
- With a keyboard, focus the handle and use **Arrow Up**, **Arrow Down**, **Home** or **End** to resize. **Escape** closes the menu.

Dragging a menu item is not how to resize the sheet. During an active scan flow, ordinary navigation may be hidden to keep the current task clear. Use the flow's own back/exit action and verify whether work was saved before leaving.

### 4.3 When a page or action is missing

A role title is not an access guarantee. Two people with similarly named roles can have different effective permissions or Organization scope. If a page opens without its edit action, record the particular operation and ask an authorized administrator to check it. Do not switch to someone else's account or enter a hidden URL as a workaround.

For account procedures, see [Section 14](#14-settings-and-account) and the [accounts and access guide](user-manual/accounts-roles-and-access.md).

## 5. Receiving

**Creating a staged WRR records what is expected. Confirming Store/Hold records what was physically received and where it was placed.** Importing a CIPL, accepting an identifying scan or printing a WRR does not by itself make the declared stock available.

See the [incoming receiving and WRR guide](user-manual/incoming-receiving-and-wrr.md) for focused procedures.

### 5.1 Before creating a WRR

**Who:** a user with the required receiving-creation permission. Read, floor-scan and confirmation permissions are separate; creating a WRR does not automatically grant all later actions.

**Have ready:** the CIPL/commercial invoice or other approved inbound paperwork; source Organization; enrolled material and business lot references; declared quantities; packaging/SPQ; dates; and applicable shipping/customs references.

| Check | Why it matters | If it is wrong |
|---|---|---|
| Correct active source relationship | VMI uses a VMI Customer, Trading uses a Trading Supplier, and Supplies uses the eligible Internal Supplies context | Correct Organization enrollment; do not select a generic company just because its name looks similar |
| One valid receiving Inventory Model | The current document workflow derives its model from the source Organization | Resolve a missing/ambiguous receiving relationship through master data; do not invent an override |
| Material enrolled and assigned to that Organization | A new WRR must not use another Organization's or an unassigned legacy material | Ask the master-data owner to correct assignment, then refresh the picker |
| Correct UOM and SPQ | Packaging converts declared base units into cartons/boxes | Correct enrollment rather than changing the shipment amount to hide a conversion problem |
| Expiry information for perishable material | Dates influence receiving and later FEFO eligibility | Obtain the source information before creating a misleading line |
| Paperwork versus actual arrival | Declared and physically received amounts can differ | Stage the correct declared document, then reconcile shortage/damage on the floor |

A historical import is not automatic permission to receive the same material against any company. Repair its missing Organization assignment before using it in a new WRR.

### 5.2 Create a staged WRR manually

**Start:** **Receiving** → the new-WRR action, or `/receiving/new` when authorized.

1. Check that another WRR does not already represent this CIPL/shipment.
2. In **Organization**, search for the company named on the source document. Read its relationship label as well as its name.
3. Confirm the inherited **Inventory Model**. The current receiving form requires a valid, unambiguous receiving relationship. If it cannot derive one, correct the Organization's setup instead of choosing an unrelated company.
4. Enter the **Commercial Invoice / CIPL Reference** and applicable **Import Permit** and **MAWB / MBL** references. Text references do not replace correct Organization/material matching.
5. Search for and select each enrolled material. Confirm the actual selected result; typed search text alone is not an item selection.
6. Check any **Customer Item Code** reference. This alias does not change the selected catalog item.
7. Enter the shipment's **Lot Number**. A business lot number is different from an internal QR/unit identifier.
8. Enter **Manufacturing Date**, required **Expiry Date**, and useful **Remarks**.
9. Enter the declared quantity in the field's stated unit. Verify the inherited UOM/SPQ and calculated box/carton count.
10. Add the other material/lot lines. Keep distinct business lots separate where the source paperwork does so.
11. Review Organization, model, references, material, lot, date and packaging values against the source document.
12. Choose **Create Staged WRR** once. While it says **Creating WRR…**, wait for the result.
13. Open the resulting WRR and verify its reference and staged status. Give that reference to the floor receiver.

**Expected result:** a staged document with expected lines. **Stock effect:** staging alone posts no incoming stock. **Next:** start receiving, identify the line, count the actual boxes and confirm their placement.

If the button says **Reconnect to create WRR**, creation requires a live connection. It has not entered the scan-only offline queue. If submission times out, search for the existing WRR/CIPL reference before opening a new form. A retry of the same submission can return its existing result; a newly created second form can duplicate the business shipment.

### 5.3 Import CIPL instead of retyping lines

Import assists data entry; it does not approve the source document or certify the goods.

1. Select the CIPL import action on the new-WRR screen.
2. Choose the supported source file and wait for parsing.
3. Review the identified source Organization first.
4. Confirm that every recognized code maps to the enrolled material assigned to that Organization.
5. Compare imported lot, date, quantity and reference values with the source. A parser's success message still requires human review.
6. Resolve unmatched/ambiguous material. If an imported identifier is locked, correct the source file or use the displayed review route rather than hiding a wrong line with another field.
7. Complete required fields and choose **Create Staged WRR**.
8. Verify the created WRR before handing over the shipment.

The current form does not require a separate manual CIPL attachment upload as an extra staging step. Import, a text CIPL reference and an archive attachment are different functions; use the document actions actually offered for the record.

### 5.4 Start receiving and identify a line

**Who:** an authorized floor receiver. **Have ready:** the correct receivable WRR, matching physical shipment and labels, enrolled material, usable scanner/device and suitable locations.

1. Open the WRR from **Receiving**. Compare Organization, CIPL/reference, material, lot and declared quantity with the goods.
2. Use **Start Receiving** or the record's receiving action when offered. If unavailable, check status/access rather than creating another WRR.
3. On the floor screen, read the current line's boxes/cartons and base-unit amount.
4. Scan the supported carton/item/lot label or use the supplied manual/camera input. A WRR header/document QR is not the physical line label requested here.
5. Read the response. On rejection, correct the stated mismatch before moving stock.
6. For a **Store** line, one valid identifying QR completes the line's remaining declared scan step and opens whole-line placement. Repeatedly scanning every box is not required just to raise that counter.
7. Independently count and inspect the physical boxes. A label confirms identity; it does not prove that all declared boxes arrived or are good.
8. Review the entire declared line's placement, shortage and hold decisions before attesting to the received amount.

**Example:** 240 declared pieces at SPQ 20 represent 12 boxes. One accepted Store-line QR can open placement for all 12 declared boxes. You must still establish whether all 12, only 11, or another supported physical quantity is present.

For inspection/Hold lines, the scan counter can advance differently from Store-line confirmation. A partial scan count is **not evidence that the other declared boxes are missing**. Reconcile the declared whole line physically and make explicit Missing/Shortage choices where boxes truly did not arrive. Never let a scan counter substitute for the actual count or QA decision.

### 5.5 Place, split, hold and record shortages

The placement control groups the work into **Primary location**, **Split Storage / Hold / Shortage per box**, and **Review**.

**Complete, acceptable delivery:**

1. Verify that the full declared amount is physically present and acceptable.
2. Search for the correct **Primary location**.
3. Confirm it is the intended active storage location and has sufficient capacity.
4. Read the assigned boxes and corresponding units in the placement summary.
5. Complete the physical-presence/placement confirmation only after checking the goods.
6. Choose **Confirm & Store / Hold Boxes** as displayed.
7. Wait for success, then verify the line's committed status before repeating an action or leaving the stock.

**Split racks, damage or shortage:**

1. Select a suitable primary destination for good stock.
2. Expand **Split Storage / Hold / Shortage per box**.
3. Review each numbered box entry. Place good boxes in valid storage locations; assign QA/nonconforming boxes to an offered **Inspection Bay / Hold**; choose **Missing / Shortage** only for boxes not actually received.
4. Ensure the split matches the physical placement. Do not assign a missing box to a rack just to make the total look complete.
5. Review **Boxes Assigned**, each location subtotal, quarantine/hold labels and any **OS&D shortage** amount.
6. Attest to the physical amount and submit the line commit.
7. Check the resulting WRR, inventory locations and remaining inspection/shortage work.

**Worked example:** twelve boxes are declared at SPQ 20, but eleven arrive. Nine are good and two are damaged. Assign six good boxes to A1-01, three to A1-02, two to the inspection bay, and one declared box to **Missing / Shortage**. Received stock is eleven boxes/220 pieces; the missing box/20 pieces must not be created. Good and held boxes have different availability consequences. Held stock is not ordinary pickable stock.

**Hold example:** twelve boxes are declared and twelve physically arrive, all awaiting QA. Put all twelve in the permitted inspection/hold location and confirm their physical presence. Do not mark eleven missing merely because one identifying QR was scanned. Only an explicit verified shortage changes the received quantity.

Storage capacity is checked again when submitted. Another receiver can consume capacity while your screen is open. If rejected, refresh and choose a valid physical split. Do not alter CBM/SPQ merely to force an overfull rack to accept stock.

### 5.6 Verify and hand over completion

After a committed line, the floor flow can return to scanning for the next incomplete line. Check the new line identity before scanning again.

1. Review every WRR line's committed/remaining state.
2. Compare posted location totals with the boxes physically stored or held.
3. Identify unresolved shortage, excess, damage, pre-alert or inspection work.
4. Use the displayed discrepancy/OS&D workflow and supply required reasons/evidence.
5. Verify the WRR's final status and relevant receipt/print result.
6. Hand over the WRR reference, business lot, affected location and exact exception to the next responsible person.

A document-generation delay is not a reason to receive the shipment again. An entirely missing line must use the explicit shortage/close route available for that state; never attest to nonexistent stock. Inspection resolution is a separate authorized decision from placing goods into a hold bay.

### 5.7 Receiving decision reference

| Result | Meaning | Next action |
|---|---|---|
| Unknown/mismatched label | No valid expected line can be confirmed | Check current document, material, lot and accepted label type |
| Item not assigned to Organization | Material cannot be used in this new receiving context | Correct enrollment assignment and refresh |
| Accepted identifying scan | The line can be reviewed for physical placement | Count, inspect, allocate and explicitly record Missing/Hold |
| Quarantine / On Hold | Stock is restricted pending QA/disposition | Complete authorized inspection resolution before release |
| OS&D shortage | Declared boxes were explicitly not received | Verify the missing amount and follow shortage resolution |
| Commit response lost | The action may already have succeeded | Reopen the same WRR and inspect status before retrying |
| Saved locally | A scan observation is preserved in this browser | Reconnect and sync; final Store/Hold still needs a live connection |

## 6. Inventory and master data

### 6.1 Read stock correctly

**Start:** **Master Inventory** → **Stock View**. Search a meaningful material code/description/reference, set the permitted Organization and Inventory Model filters, then expand the item/lot/location detail.

Organization answers whose company/context is involved; Inventory Model describes ownership/operation; location says where the physical goods are stored. The correct material code alone does not authorize a release.

| Quantity/status | Meaning | Do not assume |
|---|---|---|
| Physical/on-hand/remaining | Amount still recorded in the warehouse | Every box can be promised to another request |
| Committed/reserved | Amount promised by an active release plan | Goods have already left |
| Available | Eligible amount left after commitments/status rules | It will remain available until your submission |
| Held/quarantined | Restricted stock awaiting the required disposition | The picker may substitute it freely |
| Dispatched | The final release and outgoing movement were confirmed | The document is only a draft |

**Example:** twenty boxes are on hand, five committed, and fifteen available. Generating another three-box pick list reserves three more: physical stock remains twenty, commitments become eight, and available becomes twelve. Final dispatch of the three boxes reduces physical stock to seventeen and releases that commitment.

To investigate a discrepancy:

1. Confirm Organization and Inventory Model.
2. Clear accidental filters and open the exact material/lot.
3. Inspect its distribution by location and status.
4. Check units: 200 pieces at SPQ 20 and ten boxes represent the same amount.
5. Review movements and source WRR/pick-list references.
6. Check held/reserved status before concluding stock disappeared.
7. Use the appropriate shortage, count, inspection or transfer workflow for a real mismatch; do not edit a catalog description to hide it.

See the [inventory and withdrawals guide](user-manual/inventory-and-withdrawals.md).

### 6.2 Prepare a pick-list draft

**Who:** a user allowed to generate pick lists. **Have ready:** eligible stock, valid Organization relationships, required recipient, enrolled supplier/DSGC identity, correct SPQ and any source DRA.

**Start:** **Master Inventory** → **Pick Lists**. This prepares a commitment; it does not confirm physical departure.

1. Choose the stock **Organization**, not a similarly named recipient.
2. Confirm the **Inventory Model**. In this stock-context workflow, use an explicit eligible model choice where offered.
3. For **VMI**, select the required **End Customer / Recipient**. The VMI Customer/owner Organization and the downstream End Customer are different roles.
4. For **Trading**, select the authorized **Trading Customer / Recipient**.
5. For **Supplies**, use the eligible Internal Supplies context. If it cannot resolve correctly, ask for setup correction; do not substitute an external customer.
6. Complete those controlling fields before entering the starter item row.
7. Search/select the material and inspect its SPQ, availability and any **Needs item code** warning.
8. Enter a positive whole number in **Qty (Boxes)**. Verify calculated **Qty (Units)**.
9. Review the FIFO/FEFO source plan, lot/location breakdown and remaining amounts.
10. Add other material lines with **Add item line**. Remove empty/accidental rows and keep one Organization and Inventory Model per draft.
11. Review Customer PN, description, lot/manufacture information, boxes, derived units and sources.
12. Choose **Generate Pick List** once when enabled and note the resulting reference.

**Result:** a reserved/committed plan and priced pick list. **Stock effect:** availability changes; physical stock is not yet decremented. **Next:** review/approval where required, physical assembly and dispatch verification.

Changing the controlling Organization or model clears/invalidates dependent choices. Rebuild and review the allocation after the change rather than reusing the old source plan.

### 6.3 Boxes, units and SPQ

The current multi-item draft accepts **boxes** and derives **units** using SPQ:

`requested units = requested boxes × SPQ`

| Intended release | Enter in Qty (Boxes) | Expected Qty (Units) |
|---|---|---|
| Three boxes, 20 pieces each | 3 | 60 |
| Two boxes, 100 pieces each | 2 | 200 |
| Eight packages with SPQ 1 | 8 | 8 |

If the demand is 60 pieces at SPQ 20, enter **3**, not **60**, in the box field. If the requested demand cannot be expressed as permitted whole boxes, have the request/packaging requirement resolved; do not round without authority. Blank, zero, negative, fractional or nonnumeric box values are not valid lines.

**Customer PN** is an optional release-document reference. It does not create another material or fill a missing required supplier/DSGC identity. Leaving it blank is allowed for an otherwise valid draft; a nonexistent customer alias should not prevent release.

### 6.4 FIFO/FEFO, multiple locations and overrides

FIFO uses the approved earlier-received source order. FEFO prioritizes eligible earlier expiry for perishable stock. The server rechecks the authoritative plan when you submit.

**Ordinary multi-location example:** the earliest source has two boxes at C1-10; the next has twenty at C1-11. A five-box request can allocate two plus three. Using the second location to finish the normal FIFO demand is not automatically an override.

1. Enter the requested total boxes.
2. Inspect every source row and its allocated amount.
3. When using manual split, ensure all selected sources total exactly the requested line quantity.
4. Check remaining availability at each location.
5. After changing a total/source, inspect the whole plan again; amounts may have been capped or rebalanced.
6. Submit only a complete valid plan. If another operator changed availability, refresh and rebuild the stale allocation.

**Override example:** the earliest eligible location still has ten boxes, but the operator wants two from a later location because of a documented access issue. This is out of sequence and requires its prescribed approval path.

1. Confirm the alternative is permitted; an override is not a way to release quarantined/ineligible stock.
2. Select the supported alternate source.
3. Read **FIFO/FEFO override required**.
4. Enter a meaningful reason of at least ten characters.
5. Choose **Request Approval** and retain its reference.
6. Wait for an authorized reviewer; requesting is not approval and approval is not dispatch.
7. If rejected, expired, stale or mismatched to quantity/source, correct/recreate it through the supplied workflow.

The current request contract supports **one alternate location/target per approval request**. An unsupported multi-location out-of-sequence plan remains blocked. Revise it with a supervisor; one approval must not be assumed to authorize arbitrary additional sources/items. Normal FIFO fulfillment across multiple locations remains valid without unnecessary override approval.

### 6.5 Import a DRA

A DRA fills a draft; it does not reserve stock at parsing time.

1. Choose **Import DRA (Excel/PDF)** in Master Inventory → Pick Lists. Upload Excel (`.xlsx`/`.xls`), CSV, or a searchable PDF up to 10 MB. Image-only PDFs require a searchable copy or spreadsheet export.
2. In **Review DRA import**, review the requesting Organization and Inventory Model, then select the required recipient. A missing or unknown recipient is resolved explicitly.
3. For spreadsheets, expand **Review spreadsheet columns** to select the worksheet, header row, and available columns. Leave absent fields unmapped and choose **Re-read columns** after edits. Source locations are not required.
4. Review each extracted row. Select an enrolled item for uncertain matches, correct the requested quantity and whether it represents boxes or base units, or explicitly exclude the row. Included unresolved rows block **Use reviewed lines**.
5. Compare SPQ-derived units and document box counts. A mismatch requires reviewing and confirming the correction. Review combined demand and shortages; three boxes plus two boxes means five boxes.
6. Choose **Use reviewed lines**, confirming replacement if the draft already has entries. Review the suggested FIFO/FEFO lots and locations in the normal allocation editor. Full demand is preserved when stock is short.
7. Resolve shortages, provisional item codes, incomplete allocations, and required approvals, then generate once. See the [detailed DRA instructions](user-manual/inventory-and-withdrawals.md#7-dra-import).

The actual generation command rechecks Organization, model, recipient, identifiers, live availability and allocation.

### 6.6 Maintain Organizations and materials

Use **Data Management** and the enrollment forms authorized for your account. Some legacy directory URLs redirect to the enrollment hub; follow the resulting tab.

Organization roles are explicit: Supplier for Trading; Customer for either Trading or VMI; End Customer for VMI; Internal Supplies for internal-use stock. One role does not imply another. An End Customer is not automatically the VMI owner or a billable customer.

For each material:

1. Choose the required category/classification fields.
2. Select the eligible **Material Origin Organization**, reading its relationship and inherited model.
3. Enter the identifier, name/description and supplier/DSGC/customer cross-references.
4. Enter UOM/SPQ for the actual package.
5. Complete dimensions/CBM and boxes-per-pallet information as required.
6. Set perishability and related date expectations correctly.
7. Save, reopen and verify the persisted Organization, identifier and packaging before using it in operations.

Trading/Supplies generation requires its enrolled DSGC identity; VMI generation requires its enrolled supplier identity. A visible generic code or typed Customer PN does not silently replace a missing required identifier.

For imported/unassigned legacy material, correct the Organization assignment before new WRR entry. Creating a second material with altered spelling is not the default repair for a missing assignment. Deactivation is a lifecycle decision, not physical stock removal.

See the [master-data and Organizations guide](user-manual/master-data-and-organizations.md).

### 6.7 Maintain locations and transfers

A location has a physical label, type, capacity and active status. Use its authorized form/bulk generator.

1. Compare zone/rack, level and position with the real label.
2. Confirm storage versus inspection/hold type.
3. Set capacity in the requested unit.
4. Check duplicates, then save and verify the final location.
5. For bulk generation, review the whole range before confirming.

Editing a location does not move its contents. For a real relocation, use the authorized transfer/placement workflow with source, destination, material/lot and quantity checks. Inspect and confirm the destination after the move. Do not deactivate an occupied rack to conceal a mismatch.

### 6.8 Stock Count & Reconciliation

**Purpose:** compare a location snapshot with a physical count, review the variance and post an authorized adjustment. **Start:** **Master Inventory** → **Stock Count & Reconciliation**.

1. Find the correct location and review its stock-line/active-session overview.
2. Start the count. If **Count could not be started** appears, resolve its cause before opening another session.
3. Review each preloaded material/lot/UOM line and **System snapshot**.
4. Count physically and enter **Physical count** in the displayed unit.
5. For a genuine zero, enter zero and complete **Confirm zero**; blank is not a verified zero.
6. Add required explanation, including surplus reasons, then save the line.
7. Inspect **Variance** and check every preloaded line, including zeros.
8. Complete the all-lines confirmation and choose **Submit for Review**.
9. The authorized reviewer investigates. Use **Request Recount** with line/reason where needed, or **Approve Count** when justified.
10. After approval, the authorized user chooses **Post Reconciliation**.
11. Verify resulting stock and movement/audit references.

Saving counts and submitting for review do not post stock adjustments. Approved posting is the controlled adjustment boundary.

**Example:** the snapshot is 200 pieces. Nine boxes at SPQ 20 are physically present, so enter 180 pieces and investigate a −20 variance. Entering nine into a piece field would create a different, incorrect variance. Preserve evidence instead of overwriting the snapshot.

If stock moved during counting or a negative adjustment would consume a commitment, follow the conflict/review response. Counting is not permission to erase reservations or traceability.

## 7. Picking and dispatch

### 7.1 Understand the current work surface

A pick list is first committed/reserved, then physically assembled and verified, then finally dispatched. These are different business events even where one screen groups the work.

The current `/pick-lists/[pickListId]/pick` bookmark redirects to the dispatch work surface. Do not search for a second active scan screen just because an older guide says “open Pick first.” On the destination page, read the status and gate presented for that record.

For an allocated list, the page can show **Pick List Approval Gate** with **Approve Pick List for Dispatch**, **Review Pick List PDF**, a reservation-lock notice and a deletion/cancellation action where authorized. Approval is permission-controlled. A floor operator must not borrow a supervisor's account to pass the gate. A review-gate approval is also distinct from a FIFO override approval: they answer different questions.

Once the list is in the required picked/approved state, physical verification is available. There is no separate pre-dispatch QA route in this flow. Receiving inspection/hold must already have made the chosen stock eligible.

### 7.2 Review and physically assemble the committed stock

**Who:** the assigned, authorized warehouse operator; an authorized reviewer handles the gate where required. **Have ready:** the exact pick-list reference, recipient, committed material/lot/location plan, physical stock and usable labels/device.

1. Open the list from its queue or reference.
2. Confirm Organization, Inventory Model and recipient. For VMI, distinguish the stock-owning VMI Customer from the End Customer receiving this release.
3. Review the priced pick-list document and every committed line.
4. If the review gate is shown, have the authorized reviewer complete it after checking the plan. Do not treat a visible button as permission to approve.
5. Go to the stated rack/location, identify the correct material and business lot, and physically assemble the committed boxes.
6. Count them against the line's required box quantity. Check condition and label identity before wrapping/handing over the group.
7. If the rack is short or the material/lot differs, use the shortage/discrepancy route before final dispatch. Do not replace it with a convenient later lot or type the requested quantity as if it were counted.

**Stock effect:** assembly and verification do not themselves decrement on-hand. The commitment remains until the final permitted dispatch or an authorized release/cancellation.

### 7.3 Verify a jackwrapped location line with one QR

A matching carton/item/lot QR identifies its committed line. In the current batch-verification flow, one accepted identifying scan confirms that line's full committed box quantity and its internal box selections. It is not a reason to skip physical counting.

1. Confirm the active line's material, lot, location and required boxes.
2. Scan an accepted identifying QR using the provided field/camera, or enter the supported identity manually.
3. Read feedback and line progress.
4. For a line committed to five boxes, one valid identifying scan can complete five internal selections. Do not repeat the same scan four more times merely to imitate one-scan-per-box counting.
5. Move to the next incomplete location line and repeat its physical checks and identifying scan.
6. Confirm every committed line is complete before final submission.

**Split-location example:** three boxes of one lot are committed at A1-01 and two at A1-02. Physically verify the three-box group at A1-01 and scan its identifying label. Then verify the two-box group at A1-02 and identify that location line. Completion of the first group does not automatically confirm the second location.

A shared material QR can match more than one committed line. Online matching uses the owning workflow's incomplete-line rules. Read the resulting line/location, not only the success color. Where ambiguity remains, use the more specific accepted lot/carton identity or reconnect for authoritative matching. Do not intentionally identify a different line just because its count is still incomplete.

### 7.4 Confirm final dispatch

1. Review the complete list, correct recipient and physically assembled load.
2. Check that all required location lines are verified and no shortage/discrepancy remains unresolved.
3. Reconnect if offline. **Final dispatch always requires a live connection.**
4. Choose the displayed final dispatch/confirmation action once.
5. Wait for the outcome and resulting navigation/status.
6. Verify the list is **Dispatched**, then open its acknowledgement/delivery receipt or locate it in **Documents**.
7. If the document is delayed, verify dispatch status first and use document recovery; do not release the same stock again to obtain another PDF.

At successful final dispatch the server rechecks the commitment, status, stock and physical evidence, decrements the authoritative remaining stock, releases the associated commitment and records the outgoing movement. Both the priced pick list and the priced acknowledgement receipt belong to the release record.

For **Trading**, the document's trading price is final. For **VMI**, the release price is a reference; it is not the customer's period bill. Do not manually replace a VMI period's average-volume calculation with one receipt total.

### 7.5 Shortage, duplicate scan and interrupted dispatch

| Situation | Safe action |
|---|---|
| Fewer boxes physically present than committed | Stop, record the location shortage through the offered workflow, and let the authorized correction/release run before recounting |
| Wrong material/lot/location QR | Recheck the physical group and document; do not continue with another line's label |
| Completed line scanned again | Read the completion state; it is not another physical group to add |
| Pick list still allocated/review-gated | Complete the required authorized review before scanning/finalization |
| Commitment expired | Refresh and resolve/recreate the live plan as instructed; an expired promise is not a valid release |
| Connection lost after submitting | Reopen the same list and inspect its status before repeating the command |
| Already Dispatched | Retrieve the existing receipt; do not dispatch it again |
| Offline saved observation | Synchronize and confirm the server's actual line progress before final dispatch |

See the [outgoing, picking and dispatch guide](user-manual/outgoing-picking-and-dispatch.md) for handover and discrepancy cases.

## 8. Migration

### 8.1 Prepare the workbook

For the UBoT profile, prepare the approved workbook sheets and preserve text item codes. `Location Matrix` supplies opening stock with location, item code, lot number, quantity, and optional boxes-on-hand information. `CODES` supplies item enrollment. The workbook must be internally reconciled before commit.

### 8.2 Stage and review

1. Open **Migration**.
2. Upload the `.xlsx` workbook.
3. Review source rows, sheet detection, quantities, items, locations, parties, rates, and exceptions.
4. Correct blocking issues in the workbook and re-upload when required.
5. Resolve allowed warnings with an explicit category/note.
6. Approve the migration when no blocking issues remain.

### 8.3 Commit and verify

1. Choose **Confirm opening seed** after approval.
2. Wait for the completion response; do not refresh repeatedly during commit.
3. Open the migration success page.
4. Use **Print all lot QRs** for immediate lot-level labels.
5. If boxes-on-hand were reviewed, use **Print carton QRs** for unique carton labels.
6. If carton counts were missing, use **Resolve migrated carton counts** later.
7. Recheck Inventory by lot, location, owner and quantity.

The lot QR works even when carton traceability is pending. A carton QR is printed only after a confirmed carton identity exists.

#### Migration carton-resolution procedure

When cartons-on-hand is missing during import:

1. Keep the migration lot and aggregate balance as the source of truth.
2. Physically count cartons during cycle count, receiving-area verification, or the next controlled stock check.
3. Open the migration batch's pending carton-resolution panel.
4. Enter the verified count and submit it with the required reason/evidence.
5. Review the generated carton IDs against the lot and location before printing.
6. Use bulk carton printing to produce one label per confirmed carton.
7. Scan one or more labels in Inventory to confirm the unit-level link.

If the count is uncertain, leave the lot in pending state and use the lot QR. A lot QR remains valid throughout this process.

## 9. Reports and analytics

1. Open **Reports**.
2. Select the report section/tab.
3. Use the shared search, organization, date, category, format, and report filters shown for that report.
4. Read empty states as “no matching/available data,” not automatically as zero business activity.
5. Use export or print only after confirming filters and date range.
6. For financial reports, confirm the account has financial reporting access.

The reports surface includes inventory KPIs, activity/volume, spatial/location analytics, VMI storage/CBM reconciliation, trading capital/margin, conformance, outbound activity, and generated report archive areas as implemented by the current page.

## 10. Billing and pricing

### 10.1 VMI

Administrators or authorized financial users configure VMI contracts, permits, daily balances, period charges, corrections, payments, and statements. Review period dates, organization, storage/handling rates, CBM, and exceptions before issuing or closing a period.

### 10.2 Trading

Configure trading contracts/rate cards and review margin/ledger output. Trading document prices are final for the document. Do not interpret the VMI period-average billing rule as a trading-document rule.

### 10.3 Billing error handling

Do not manually change an issued/closed period to hide a discrepancy. Use the provided correction/void/payment workflow and preserve the supporting document/audit evidence.

## 11. Documents Center

1. Open **Documents Center**.
2. Select the document family tab: WRRs/receipts, inbound CI/PL/invoices, pick lists/DRA, delivery receipts, SOA, or reports/audit logs.
3. Search by document/reference/lot/organization as supported.
4. Apply only the filters relevant to the active family. WRRs use supplier and VMI-customer organization context; pick lists and delivery receipts use trading-customer/end-customer context; SOA uses its billing organization context; reports/audit logs use the authorized reporting scope. RBAC still limits the result set.
5. The archive shows finalized records only. In-progress, pending-arrival, or cancelled operational records are not treated as completed archive artifacts.
6. Open a preview to verify the correct record.
7. Download or reprint only when the action is permitted.
8. Confirm the generated artifact remains linked to its source record.

All official document previews and generated PDFs use one uniform 11pt Helvetica-family font. If the browser preview looks stale, refresh the page with `Ctrl+F5` before saving or printing.

The archive is the authoritative document location. Do not assume every tab uses the same status values; the active document family determines its filters and actions.

## 12. QR codes and scanning

### 12.1 QR types

- **Lot QR:** one per lot; opens aggregate lot/inventory information.
- **WRR unit QR:** unique per physical unit for receiving.
- **Migration carton QR:** unique per confirmed migrated carton.

Do not print one lot QR and attach it to every carton when carton-level duplicate detection is required. Use carton labels for carton-level tracing.

### 12.2 Print a lot QR

1. Open the lot in Inventory.
2. Choose **View QR**.
3. Confirm the lot number/item shown in the modal.
4. Choose **Print 2×2 Label**.
5. In the browser print dialog, confirm the preview contains one label page.
6. Save/print using the configured thermal printer.

### 12.3 Print bulk migrated QRs

Use the migration success page after commit. **Print all lot QRs** creates one print job containing one label per lot. **Print carton QRs** creates one label per confirmed migration carton. The browser may show many pages; each page should contain a real QR label, not a blank page.

### 12.4 Scan on mobile

1. Open the floor workflow.
2. Tap the scanner action.
3. Grant camera access when prompted.
4. Aim at the QR until the success/error feedback appears.
5. Read the next-action instruction.
6. If the camera cannot be used, select the manual fallback and enter the item/lot/carton value.

The scanned QR may contain an internal UUID or carton identifier instead of the visible item code. That is expected. Omni Scanner resolves the identifier to the related record; a random-looking alphanumeric value is not itself the item description. If it resolves to nothing, verify the workflow, organization scope, and label type.

### 12.5 Invalid or duplicate scan

Stop and read the error. A duplicate physical label is not the same as a second valid carton. Check that the QR belongs to the current WRR/pick list, item, lot, location, and flow. Do not repeatedly scan the same label hoping to override the rejection.

### 12.6 QR printing decision table

| Need | Correct label | Expected print behavior |
|---|---|---|
| Look up one aggregate lot | Lot QR | One 2×2 thermal label/page |
| Receive cartons from a WRR | WRR unit/carton label | One label per expected/confirmed physical unit as supported by the WRR |
| Migrate stock with known cartons | Migration carton QR | Bulk job, one unique label/page per carton |
| Migrate stock before cartons are counted | Lot QR | Immediate lot-level tracking; carton print is deferred |

The browser's print dialog may report a page count equal to the number of labels in a bulk job. A single lot print should show one label page. Blank pages indicate a print-rendering or printer configuration problem and must be verified in preview before saving.

## 13. Organization portal

1. Open **Organization Portal**.
2. Choose Inventory, Orders, or Documents.
3. Use the search/filter controls within the permitted organization scope.
4. Open records for detail; do not expect unrestricted warehouse-wide visibility.
5. Use exports/downloads only where the portal grants them.

Notifications and labels are planned registry entries and may not be available in the current release.

## 14. Settings and account

### Profile

Open **Profile** to review the current account and preferences. Update only fields the account is allowed to change. Sign out when leaving a shared device.

### Settings

Administrators use General, Security, and Team settings according to their grants. To edit a custom permission bundle or assign roles to an account, follow [Accounts, roles, and access](user-manual/accounts-roles-and-access.md). The Team account editor changes which roles the account has; the Roles & permissions editor changes a custom role definition. Built-in roles such as Warehouse Staff, Supervisor, Administrator, and Party User are protected.

This manual documents the repository behavior and recorded local checks. It does not certify the hosted deployment or live account configuration. The latest full-system documentation audit, including open billing, scanner, browser, migration, and UAT checks, is in [System Documentation](System_Documentation.md) §10.4.

## 15. End-to-end tutorials

### Tutorial A — Receive a supplier shipment

**Objective:** receive a shipment into a valid location.  
**Role:** warehouse staff/authorized receiver.  
**Prerequisites:** staged WRR, enrolled items, location capacity, scanner/manual fallback.

1. Open Receiving and the correct WRR.
2. Verify organization, item, lot, and expected quantity.
3. Scan the first carton/item.
4. If accepted, repeat for the remaining physical cartons required by the line.
5. If rejected, read the reason and correct the physical/document mismatch.
6. Record inspection observations if required.
7. Assign the destination location.
8. Confirm Store/Hold.
9. Verify the lot/location balance and receipt document.

**Final verification:** Inventory shows the expected lot and location, and Documents Center contains the supporting receipt/WRR artifact.

### Tutorial B — Generate and dispatch a pick list

**Objective:** move committed stock through pick and dispatch.  
**Role:** authorized picker/dispatcher.

1. Open Inventory and create/review the pick list.
2. Confirm organization, recipient, lot, quantity and price.
3. Open the floor pick screen.
4. Scan/select the required cartons.
5. Resolve any unavailable or duplicate unit.
6. Open Dispatch after physical picking is complete.
7. Scan the lot or exact carton QR.
8. Confirm dispatch and retrieve the acknowledgement receipt.

**Final verification:** the pick list is dispatched, selected units transition correctly, and the receipt is archived.

### Tutorial C — Migrate opening stock

**Objective:** seed current inventory from the approved workbook.  
**Role:** administrator.

1. Validate the workbook sheets and preserve text codes.
2. Upload it at Migration.
3. Review blocking and warning exceptions.
4. Correct/re-upload or resolve allowed warnings.
5. Approve and confirm the opening seed.
6. Verify lot/location/quantity totals in Inventory.
7. Print lot QRs immediately.
8. Print carton QRs if box counts were confirmed.
9. Resolve pending carton counts later when physical verification is complete.

**Recovery:** if commit fails, do not assume partial success; verify the batch status and database/inventory results before retrying.

### Tutorial D — Investigate a report discrepancy

**Objective:** distinguish a filter issue from a data issue.  
**Role:** supervisor/authorized reporting user.

1. Open Reports.
2. Clear search, organization and date filters.
3. Re-run the report and note the total.
4. Narrow one filter at a time.
5. Open the underlying inventory/document/transaction record.
6. Compare the source record’s status and date with the report’s date basis.
7. Escalate a genuine mismatch with record IDs, filters, time, and screenshots.

## 16. Errors and troubleshooting

### 16.1 Operational exception matrix

Use the three-part response for every exception: **what happened**, **why it happened**, and **what to do next**. The detailed companion guide contains the full SOP; this matrix is the fast decision path.

| Exception | Do not do | Correct next action |
|---|---|---|
| WRR header/document QR scanned on floor | Do not keep rescanning the header | Scan the physical carton/unit label |
| Unknown item barcode | Do not create an item silently from the floor | Pause, ask the catalog owner to enroll/correct the item, then rescan |
| Inventory-model mismatch | Do not force the item into the WRR | Check shipment paperwork and route to supervisor review |
| Unconfirmed advance notice | Do not self-confirm a counterparty-submitted notice | Back-office user reviews and confirms the matching WRR/CIPL |
| Damaged cartons in a good pallet | Do not store damaged cartons as available | Split good cartons to storage and damaged cartons to hold/reject with remarks |
| Delivery shortage | Do not create stock for cartons not physically present | Mark missing cartons, commit the present quantity, then finalize OS&D when resolved |
| Location full | Do not exceed location capacity | Split the line across valid locations |
| Duplicate submit/network retry | Do not press the mutation repeatedly without checking state | Refresh and verify the record; retry once only when the transaction is still open |
| Quarantined lot selected for pick | Do not override quarantine at the pick screen | Resolve inspection, then transfer/pass the stock into an eligible location |
| FIFO/FEFO alternative requested | Do not treat the alternative as ordinary allocation | Provide the reason and wait for the required approval |
| Picked quantity differs at rack | Do not dispatch the planned quantity blindly | Report the location shortage, release the missing reservation, and recount |
| Commitment expired | Do not assume the old reservation is still valid | Confirm released stock and create a new pick list |
| Dispatch evidence incomplete | Do not finalize with fewer verified cartons | Locate and scan the missing carton or resolve the discrepancy |
| Document preview/download timeout | Do not recreate the operational transaction | Verify dispatch/receipt status, then regenerate or download from Documents Center |

| Problem | First checks | Recovery |
|---|---|---|
| Page is missing | Role/grant, route status, correct account | Contact administrator; planned routes are not defects |
| Save rejected | Required fields, dates, item/party/location match | Correct the highlighted field and retry once |
| Scan unknown | Correct workflow, item enrollment, QR type, camera focus | Use manual fallback or ask master-data owner to enroll/correct |
| Scan duplicate | Same physical label already recorded | Find the next physical carton; do not reuse the label |
| Quantity mismatch | WRR expected quantity vs physical count | Record discrepancy/inspection and follow approved resolution |
| Lot QR prints blank | Modal fully rendered, browser print preview, printer margins | Refresh, reopen modal, wait for preview, verify print CSS/browser; escalate with browser/version |
| Bulk print has wrong count | Confirm selected batch and lots | Return to migration success/inventory and verify labels before printing |
| Migration blocked | Review queue and source row | Correct workbook or resolve allowed warning; do not bypass blocking issues |
| Migration carton pending | No confirmed boxes-on-hand | Enter physical carton count later, then generate/print cartons |
| Dispatch says unavailable | Unit already selected/dispatched or wrong lot/location | Refresh the pick list and verify the exact physical carton |
| Report appears empty | Active tab, filters, date range, permissions | Clear filters and verify source records |
| Session expired | Authentication/session banner | Sign in again and verify whether the last mutation committed |
| Network interruption | Connectivity indicator and record status | Wait/reconnect, then verify state before resubmitting |

For support, record the user, role, route, record ID, exact message, timestamp, browser/device, network state, and screenshot. Never include passwords or secrets.

## 17. FAQ, glossary, and quick reference

### FAQ

**Why can I see a route but not an action?**  
The route and the mutation have different grants; server authorization controls the action.

**Why does a lot QR print one page but carton printing print many?**  
A lot QR identifies one lot. Carton printing intentionally produces one label per physical carton.

**Can a lot QR replace carton labels?**  
Only for aggregate lot lookup. It cannot distinguish individual cartons or reject a duplicate carton label.

**Can missing migration box counts be added later?**  
Yes. The lot remains trackable, then an administrator resolves the physical count and generates migration carton identities.

**Why is a mobile table a card?**  
Wide tables are converted to labeled cards so floor users do not need inaccessible horizontal scrolling.

**Why is a document status filter missing?**  
Document tabs have different status vocabularies; filters are shown only where they are meaningful for the active document family.

### Quick reference

| Need | Start here |
|---|---|
| Receive shipment | Receiving → WRR → Receive |
| Inspect discrepancy | Receiving/Inventory → Inspection |
| View lot stock | Inventory → Stock View |
| Create pick list | Inventory → Pick Lists |
| Dispatch | Pick List → Dispatch |
| Find archived file | Documents Center |
| Run operational report | Reports |
| Configure rates/contracts | Billing & Pricing |
| Import opening stock | Migration |
| Manage item/location/party | Master Data |
| Print lot QR | Inventory → Lot → View QR |
| Print migrated labels | Migration success → Print all lot/carton QRs |

### Glossary

| Term | Meaning |
|---|---|
| WRR | Warehouse Receiving Report |
| CIPL | Commercial invoice/packing list |
| DRA | Delivery/dispatch-related document import |
| Lot | A business batch of inventory |
| Carton/unit | One physical box tracked individually when available |
| VMI | Vendor-managed/vendor-owned inventory |
| CBM | Cubic metre volume |
| SPQ | Standard packaging quantity |
| RCV | Temporary receiving/holding location |
| SOA | Statement of Account |
| Quarantined | Held from ordinary availability until resolved |

## 18. User Manual appendices

### Appendix A — Visual capture and annotation manifest

The signed release must attach screenshots captured from the deployed UAT environment. Each capture should show the page title, active tab, relevant controls, and the resulting state; redact names, emails, tokens, prices, or customer information that are not approved for training use.

| ID | Required capture | Annotation points |
|---|---|---|
| UM-F01 | Desktop shell/dashboard | Navigation, queue cards, refresh/export, role-scoped visibility |
| UM-F02 | Mobile floor landing | Scan-first action, manual fallback, bottom/floating scanner, connectivity |
| UM-F03 | New WRR and CIPL import | Header fields, import button, line validation, attachment |
| UM-F04 | WRR receive/putaway | Scanner feedback, quantity, split locations, Store/Hold |
| UM-F05 | Inventory stock/lot detail | Search/filter, mobile card, lot balance, lot QR |
| UM-F06 | Pick-list draft and DRA import | Recipient/model, lines, SPQ validation, generate action |
| UM-F07 | Pick checklist and dispatch | Scan evidence, progress, discrepancy, confirm |
| UM-F08 | Migration review/success | Exceptions, approval/commit, lot and carton bulk-print actions |
| UM-F09 | Documents Center | Family tabs, search/date/organization filters, preview/reprint |
| UM-F10 | Reports and billing | Report filters, chart/table, VMI period/SOA or trading policy |
| UM-F11 | Enrollment/master data | Origin organization restriction, inherited model, item/location/party fields |
| UM-F12 | Portal/settings | Party scope, account/security/team settings, permission state |

No screenshot is represented as verified in this repository until it is captured from the running UAT release. The manifest is an explicit evidence requirement, not a substitute screenshot.

### Appendix B — Tutorial evidence template

For each training/UAT tutorial, record: scenario ID, role, device/browser, starting record IDs, preconditions, numbered actions, expected result after each mutation, actual result, screenshots/video, error text, recovery performed, final inventory/document state, tester, date, and sign-off. This evidence format supports the approved UAT scenarios in `specs/20-documentation-training-and-uat/`.

### Appendix C — Cross-reference table

| User-facing topic | Technical reference |
|---|---|
| Why a permission/action is unavailable | System Documentation §5 |
| Why a lot/carton QR behaves differently | System Documentation §4.3 and §7 |
| Why dispatch does not decrement at pick time | System Documentation §6.2 |
| Why a document reprint is auditable | System Documentation §7.2 and §11 Appendix A |
| Why mobile tables become cards | System Documentation §2.4 |
| Why migration carton labels may be deferred | System Documentation §4.3 and §6.3 |

### Appendix D — Shared component quick reference

| Component family | Examples users encounter | Behavior to expect |
|---|---|---|
| Search/filter | `FilterSearchInput`, `FilterSelect`, `FilterDateInput`, `SearchInput` | Uniform label/value geometry; filters apply to the active page/family |
| Selection/forms | `Select`, `Input`, `Textarea`, `Checkbox`, `Radio`, `Switch` | Required/disabled/error states explain what must be corrected |
| Feedback | `Alert`, `EmptyState`, `LoadingSpinner`, `Skeleton`, `StatusBadge`, `WorkflowState` | Shows progress, no-result state, status, or next action |
| Navigation | `Tabs`, `Page`, `PageBreadcrumb`, `ShellNavigation`, `TablePagination` | Changes work area or result page without changing unrelated records |
| Data presentation | `Card`, `StatCard`, `DataTable`, `MobileDataCard`, `MobileTableEnhancer` | Desktop rows become labeled mobile cards where the table is wide |
| Scanning | `MobileQRScanner`, `CameraScanBridge`, `ScanFeedbackProvider`, `FloorCameraScanner` | Camera first on mobile, manual fallback where supported |
| Documents/print | `DocumentPreviewModal`, `DocumentReprintDialog`, `MasterDocumentHeader/Footer`, label generators | Preview/download/reprint is tied to the source record and audit rules |

## 19. 2026-11-04 implementation and verification audit

The following changes are part of the current documented release:

- **Receiving:** staged scan loop, line-level recognition from a valid carton QR, explicit Start Receiving recovery errors, protection against incomplete allocations, shortage/OS&D handling, inspection/hold routing, and looping back to the first screen after a confirmed line store.
- **Receiving data rules:** WRR inventory model is inherited from the selected Organization; VMI ownership is derived from that Organization; item UOM/SPQ is inherited from enrollment; carton count is derived from total base-unit quantity divided by SPQ; redundant VMI-owner input is removed; manual CIPL attachment is no longer part of WRR creation.
- **QR and labels:** stable lot/carton/unit identifiers, Omni Scanner resolution of carton QR values, 2×2 label sizing and centering, Safari/Chromium print handling, valid-SPQ gating, and blank-page troubleshooting.
- **Pick lists/DRA:** input fields follow the operational flow, item selection is searchable, FIFO carton allocations are derived, DRA item/box mappings are validated, and duplicate item demand is consolidated.
- **Documents:** initial tab counts load without opening each tab; the archive presents finalized artifacts; previews are embedded safely; organization filters are family-specific and RBAC-scoped; the shared preview/PDF typography contract is uniform 11pt.
- **Identity and access:** the login page uses the full company name, **Dyna-Serv Global Corporation**, and a neutral **Welcome** greeting.
- **Inventory controls:** Stock Count & Reconciliation provides searchable/filterable location selection, a location overview, snapshot-based count entry, variance/recount handling, supervisor review, approved posting, and visible start-error recovery.
- **UI cleanup:** the dashboard zone breakdown was removed, and the receiving/pick-list/document surfaces use clearer mobile and print hierarchy.
- **Dynamic RBAC:** administrators can create, edit, and deactivate custom roles, assign multiple roles to existing accounts, and inspect current versus proposed effective grants. Role and assignment changes require a reason and confirmation, are audited, and affect the next protected request. Built-in roles remain protected.
- **Verification boundary:** local dynamic-RBAC integration checks and the production build passed per `specs/02-rbac-roles/tasks.md`; authenticated browser E2E and hosted migration application remain unverified. See [System Documentation](System_Documentation.md) §10 for the repository-wide audit and open evidence gaps.

## 20. Coverage checklist and revision history

### User Manual coverage

- [x] Getting started, account, devices and browser guidance
- [x] Navigation, page/subpage catalog, tabs, cards, tables, filters, modals, statuses and buttons
- [x] Shared component quick reference and field-by-field operational reference for major forms
- [x] Role responsibilities and access behavior
- [x] Receiving, inventory, dispatch, migration, reports, billing, documents, QR/scanning, portal and settings
- [x] Desktop/mobile behavior and mobile table/scanner guidance
- [x] Step-by-step tutorials with objective, role, prerequisites, expected result and recovery
- [x] Validation, permissions, transaction, scan, migration, print, network and report troubleshooting
- [x] FAQ, glossary, quick reference, appendices, diagrams/table references and revision history
- [ ] Deployed-environment screenshots/annotated controls — requires UAT capture from the running release

### Revision history

| Version | Date | Change |
|---|---|---|
| 2.1 | 2026-11-04 | Added custom-role/account-access instructions and recommended role bundles; corrected companion-guide links; recorded the repository audit and verification limits |
| 1.3 | 2026-10-27 | Documented the complete same-day receiving, QR/label, pick-list, archive, login, stock-count, and uniform 11pt preview/PDF changes |
| 1.2 | 2026-10-27 | Expanded role guides, complete page/subpage catalog, field reference, visual capture manifest, technical cross-references, and training evidence template |
| 1.1 | 2026-10-27 | Unified the six detailed companion guides, added QR/carton traceability rules, material-origin organization rules, and the operational exception matrix |
| 1.0 | 2026-10-27 | Initial repository-based user manual |
