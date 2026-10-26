# Dyna-Serv WIMS — User Manual

**Document type:** Operational user guide  
**System:** Dyna-Serv Warehouse Inventory Management System (WIMS)  
**Version:** 1.1  
**Evidence baseline:** Application routes, components, approved specifications, and verified source behavior inspected 2026-10-27  
**Audience:** Administrators, supervisors, warehouse staff, organization users, and trained operational users

> This guide explains what an authorized user can do. If a button, tab, or route is not visible, the account may not have the required permission or the feature may be planned/deferred.

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
19. [Coverage checklist and revision history](#19-coverage-checklist-and-revision-history)

**Visual references:** the page/component catalog, form-field reference, QR decision table, exception matrix, and Appendix A screenshot manifest are the operational visual-reference index. Final annotated screenshots remain UAT evidence and are not fabricated from source inspection.

The detailed operating guides below are maintained companions to this manual. They are not separate sources of truth; when a rule changes, update this manual and the companion chapter together.

| Companion guide | Use it for |
|---|---|
| [Incoming receiving and WRR](user-manual/incoming-receiving-and-wrr.md) | CIPL/pre-alert intake, line-by-line receiving, putaway, shortages, holds, and WRR closure |
| [Inventory and withdrawals](user-manual/inventory-and-withdrawals.md) | Inventory models, SPQ/loose-unit rules, stock history, and withdrawal initiation |
| [Outgoing picking and dispatch](user-manual/outgoing-picking-and-dispatch.md) | Two-stage commitment, FIFO/FEFO allocation, physical picking, gate scans, and dispatch |
| [Master data and organizations](user-manual/master-data-and-organizations.md) | Parties, item enrollment, origin organization, inherited inventory model, and locations |
| [Document printing and compliance](user-manual/document-printing-and-compliance.md) | Print layouts, signatures, reprints, pricing disclaimers, and document retention |
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

1. Open the WIMS application URL.
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

### 4.1 Dashboard purpose

The dashboard summarizes operational queues, inventory health, inbound/outbound activity, low stock, quarantine/hold indicators, stock valuation, and report shortcuts according to the user’s grants. It is a starting point, not a replacement for the authoritative transaction screen.

### 4.2 Navigation groups

- **Main:** dashboard, receiving, inventory, outgoing, pick lists, approvals.
- **Reports:** documents and reports.
- **Master Data:** enrollment, billing/pricing, migration, items, locations, parties.
- **Account:** profile and settings.
- **Organization Portal:** organization-scoped portal screens.

### 4.3 Dashboard tutorial

1. Open `/` after signing in.
2. Read the inbound/outbound queue cards.
3. Check low-stock and quarantine indicators.
4. Open the relevant queue using its primary action.
5. Use **Refresh** when the screen says data may have changed.
6. Use the desktop search or mobile scanner/manual fallback according to the device.

Expected result: you reach the authoritative work queue and can verify the record state before acting.

## 5. Receiving

### 5.1 Create a WRR manually

**Role:** authorized receiving/office user  
**Prerequisites:** item, organization, location/model data; expected quantity and shipment references.

1. Open **Receiving** and choose **New WRR**.
2. Complete header information: organization, inventory model, commercial/shipping references, and attachments where applicable.
3. Add at least one incoming line.
4. Select the item/DSGC number; confirm the description is filled or correct.
5. Enter lot number, manufacturing/expiry dates, remarks, expected quantity, unit CBM, and UOM.
6. Choose the correct disposition and save/stage the WRR.
7. Review the confirmation and open the WRR detail.

If a field is marked required, the record cannot safely proceed until it is valid. Do not use a random organization to bypass a missing supplier/VMI customer.

### 5.2 Import CIPL

1. Open the receiving creation workflow.
2. Choose **Import CIPL**.
3. Upload the supported workbook/document format.
4. Review parsed rows, item matches, quantities, dates, and any validation messages.
5. Correct rejected rows or complete missing fields.
6. Confirm the import into the WRR form.
7. Review all lines before saving.

Expected result: imported values are visible in editable WRR lines and unresolved rows are not silently treated as valid.

### 5.3 Receive and scan on the floor

1. Open the WRR detail and choose the receiving/floor action.
2. Start camera scanning on mobile, or use the provided manual entry fallback.
3. Scan the item, lot, carton, or approved QR.
4. Read the feedback: what happened, why it succeeded/failed, and the next action.
5. Continue until the line is eligible for its disposition.
6. Record inspection observations when required.
7. Assign locations using the putaway selector.
8. Confirm **Store** or **Hold** only after reviewing quantities and location capacity.

Common rejection reasons include unknown item, wrong WRR, wrong flow type, duplicate label, over-quantity, fully scanned line, and insufficient/invalid location capacity.

### 5.4 Inspection and discrepancy recovery

For damaged, wrong, short, paperwork, TDC, quantity, or other non-conforming arrivals:

1. Stop treating the line as an ordinary successful receipt.
2. Choose the inspection/discrepancy action.
3. Select the approved reason and record the evidence/remarks.
4. Follow the resolution state shown by the screen.
5. Do not force Store/Hold until the required inspection or approval is complete.

#### Receiving decision table

| Physical result | System action | Inventory result |
|---|---|---|
| All expected cartons present and acceptable | Assign storage and choose **Store** | Present cartons become available after commit |
| Present but damaged/non-conforming | Split good cartons from hold/reject cartons | Good cartons may be stored; held/rejected cartons remain unavailable |
| Fewer cartons arrived | Assign present cartons; mark the remainder missing | Only present cartons are posted; shortage remains an OS&D discrepancy |
| Item is unknown or belongs to another model | Stop and resolve master data/document mismatch | No forced receipt is created |
| Location has insufficient CBM | Split across valid locations | Same lot may have multiple location balances |

Use the companion [receiving guide](user-manual/incoming-receiving-and-wrr.md) for the complete step-by-step SOP and the [edge-case guide](user-manual/edge-cases-and-troubleshooting.md#2-inbound-receiving-edge-cases--sops) for recovery messages.

## 6. Inventory and master data

### 6.1 Master Inventory

Open **Inventory** to view stock, pick lists, and inspection work. Use **Stock View** to search item, lot, location, and organization data. Expand an item to review its lots and locations. On mobile, read the lot card fields rather than looking for a wide table.

The inventory lot QR is one QR per lot and identifies aggregate lot information. A carton QR is a separate unique identity for one physical carton when exact units exist.

### 6.2 Generate a pick list from inventory

1. Open Inventory and choose the pick-list work area.
2. Select organization/inventory model and recipient fields.
3. Select eligible stock lines and quantities.
4. Review the selected lines, lot/location, and price behavior.
5. Save or generate the pick list.
6. Open the resulting queue and proceed to physical picking.

### 6.3 Enroll an item

1. Open **Enrollment** or **Master Data → Items**.
2. Choose **New Item**.
3. Select the model/category/type/subcategory hierarchy.
4. Select the material-origin organization. The selector should show only permitted supplier/VMI-customer options for this workflow.
5. Confirm the inherited inventory model.
6. Complete item code, description, packaging, dimensions, UOM, CBM and classification fields.
7. Save and review the resulting catalog record.

### 6.4 Manage locations

1. Open **Master Data → Locations**.
2. Create one location or open the bulk generator.
3. Define zone, rack, level, position, type, and capacity.
4. Review generated labels/locations for duplicates and naming mistakes.
5. Save/deactivate only when the operational impact is understood.

### 6.5 Inventory balance and traceability rules

For a standard packed item, the operational relationship is:

`base-unit balance = cartons on hand × SPQ`, adjusted for any recorded loose-unit or partial-pack rule belonging to that inventory model.

The lot is the business batch and remains the aggregate traceability anchor. A carton/unit identity is a separate physical identity. Migration therefore supports two valid states:

| State | What can be traced | What cannot yet be traced |
|---|---|---|
| Lot QR only | Item, lot, owner/model, locations, aggregate balance, source migration batch | Which exact carton was scanned |
| Lot QR plus migration carton QRs | Everything above plus each confirmed carton identity and carton-level dispatch history | Nothing within the confirmed carton set |

If the migration workbook has no reliable boxes-on-hand value, commit the lot balance with carton traceability marked pending. An administrator can later record the physically verified carton count, generate unique carton identities, and print the labels in bulk. Never invent carton IDs or silently change the lot balance to make carton count fit.

## 7. Picking and dispatch

### 7.1 Pick workflow

1. Open **Outgoing** or **Pick Lists**.
2. Open the eligible pick list.
3. Review organization, recipient, lot, location, quantity, and price.
4. Start the floor pick screen.
5. Scan/confirm each required carton or use the approved shared lot/item path.
6. Resolve wrong-item, unavailable, already-selected, or quantity errors before continuing.
7. Confirm physical picking and move to dispatch when the checklist is complete.

### 7.2 Dispatch workflow

1. Open the pick list’s **Dispatch** action.
2. Confirm the list is in the required picked/approved state.
3. Scan the lot/item QR or the exact carton QR.
4. Verify the selected count and remaining count.
5. Resolve any wrong lot, duplicate carton, line-complete, or unavailable-unit message.
6. Confirm dispatch.
7. Open or download the acknowledgement receipt when available.
8. Confirm the resulting document is visible in Documents Center.

### 7.3 Dispatch correction

Never repeat a dispatch submission solely because the browser appeared slow. Refresh the record and check the status/document archive first. If the operation did commit, a second submission may be rejected as duplicate or complete.

#### Dispatch safety rules

- Trading prices on a pick list and acknowledgement receipt are final document prices.
- VMI prices shown on a release document are reference values; the authoritative charge is the period-average VMI statement.
- A lot QR can identify the aggregate lot, but a confirmed carton QR is required when the operation must prove which physical carton was dispatched.
- A commitment reserves stock before physical decrement. Physical decrement occurs only at successful dispatch confirmation.
- An expired or rejected commitment must be rechecked before creating a replacement list; do not assume the original reservation remains.

See the [outgoing guide](user-manual/outgoing-picking-and-dispatch.md) and the [dispatch exception matrix](user-manual/edge-cases-and-troubleshooting.md#5-physical-picking--dispatch-confirmation-edge-cases).

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
4. Apply date and organization filters.
5. Open a preview to verify the correct record.
6. Download or reprint only when the action is permitted.
7. Confirm the generated artifact remains linked to its source record.

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

Administrators use General, Security, and Team settings according to their grants. Role changes are sensitive: verify the user, intended role, effective capabilities, and audit/notification behavior before saving.

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

## 19. Coverage checklist and revision history

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
| 1.2 | 2026-10-27 | Expanded role guides, complete page/subpage catalog, field reference, visual capture manifest, technical cross-references, and training evidence template |
| 1.1 | 2026-10-27 | Unified the six detailed companion guides, added QR/carton traceability rules, material-origin organization rules, and the operational exception matrix |
| 1.0 | 2026-10-27 | Initial repository-based user manual |
