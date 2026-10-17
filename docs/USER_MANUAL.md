# Dyna-Serv WIMS — Complete User Manual

**Document owner:** Dyna-Serv Warehouse Operations
**Audience:** Warehouse staff, supervisors, administrators, finance users, and authorized organization users
**System:** Dyna-Serv Warehouse Inventory Management System (WIMS)
**Version:** 1.0

> This manual explains what the system does, who may use each area, where to find it, when to use it, and how to complete the supported workflows. Access is capability-based: a user may see fewer pages or actions than the examples below.

---

## 1. What Dyna-Serv WIMS is

Dyna-Serv WIMS is a single-warehouse operations system for receiving, storing, inspecting, picking, withdrawing, billing, reporting, document control, and organization management.

It supports three distinct inventory models in the same physical warehouse:

| Inventory model | Ownership and operating purpose | Main financial treatment |
|---|---|---|
| **VMI** | Vendor-owned stock stored and managed by Dyna-Serv | CBM/storage utilization and period billing; a release price is only a reference |
| **Trading** | Dyna-Serv buys stock and sells it to a customer | Buy/sell pricing and margin; the trading price on the document is final |
| **Supplies** | Internal warehouse stock for operational use | Internal consumption; excluded from organization-user visibility and customer billing |

The system keeps these models separate while using common items, lots, locations, receiving, and withdrawal controls.

### What the system is not

- It is not a multi-warehouse system in the current operating model; there is one warehouse and no warehouse selector.
- It does not use **supplier**, **SKU**, or **bin** as canonical system names. Use **organization**, **item**, and **location**.
- It does not treat a pick list as a completed withdrawal. A pick list is allocated first and dispatched only after the physical dispatch step.
- It does not allow an organization user to see another organization’s scoped data.

---

## 2. Who should use the system

### Warehouse Staff

Use WIMS for floor operations:

- receiving and scanning inbound goods;
- putaway and location confirmation;
- picking and dispatch scanning;
- recording inspection dispositions when assigned;
- viewing operational inventory information within granted scope.

Warehouse staff should not approve their own exceptions or access financial reports unless separately granted.

### Supervisors

Use WIMS for operational oversight:

- reviewing dashboard status and low-stock alerts;
- approving FIFO/FEFO overrides and other approval requests;
- supervising receiving, inspection, picking, and dispatch;
- reviewing reports and financial reporting where granted;
- reviewing organization and item information.

### Administrators

Use WIMS for system administration and full operational oversight:

- managing users, roles, invitations, scopes, and account status;
- configuring general and security settings;
- maintaining organizations, items, locations, and inventory models;
- reviewing audit history;
- accessing operational, financial, billing, reporting, and document areas according to the active capability set.

Administrators remain subject to server-side authorization, row-level security, and the prohibition on self-approval.

### Finance and office users

Use the office surfaces for billing, pricing, reports, documents, and approved master data. Financial columns and actions are only available to users with the applicable financial capability.

### Organization users

Authorized external organization users use the organization portal for their own scoped inventory, orders, documents, and reports. They do not receive access to internal Supplies data or other organizations’ records.

---

## 3. Access and security model

### Signing in

1. Open the WIMS application URL.
2. Enter the email address and password assigned to you.
3. Complete any required invitation or password setup.
4. If the invitation is expired, ask an administrator to resend it.

The invitation page establishes the browser session from the invitation link before allowing account setup. Do not forward an invitation link to another person.

### Roles and permissions

WIMS evaluates the user’s current active roles and capabilities on every protected request. The navigation is a convenience; hiding a button is not the security boundary.

Access can be limited by:

- role and capability;
- assigned organization scope;
- inventory model and business state;
- user account status;
- approval separation-of-duties rules.

If a page or action is missing, do not work around it by changing the URL. Ask an administrator to confirm the required capability and scope.

### Important security rules

- Do not share passwords, invitation links, API keys, or session screenshots containing sensitive values.
- Confirm the organization, item, lot, and location before committing a transaction.
- Never approve your own request.
- Use the audit log for investigation; do not treat browser history or screenshots as the official record.
- Report unexpected access, duplicate transactions, or suspicious data immediately to an administrator.

---

## 4. Navigation overview

The main application areas are:

| Area | Route | Primary users | Use it for |
|---|---|---|---|
| Dashboard | `/` | All internal users | Operational summary, alerts, low-stock view, and shortcuts |
| Receiving / Incoming | `/receiving` | Staff, Supervisor, Administrator | Create, review, scan, receive, and close WRRs |
| Master Inventory | `/inventory` | Staff, Supervisor, Administrator | Stock view, lots, locations, pick lists, inspection queue |
| Withdrawal / Outgoing | `/outgoing` | Staff, Supervisor, Administrator | Active picks and outgoing ledger |
| Approvals | `/approvals` | Supervisor, Administrator | Review and decide approval requests |
| Reports & Analytics | `/reports` | Supervisor, Administrator, authorized organization users | KPIs, trends, activity, inventory and financial analysis |
| Documents | `/documents` | Authorized internal and organization users | Find, preview, download, print, and reprint documents |
| Enrollment | `/enrollment` | Supervisor, Administrator | Organizations, items, and locations |
| Billing & Pricing | `/billing-pricing` | Finance, Supervisor, Administrator | VMI billing, trading pricing, contracts, SOA, and pricing rules |
| Profile | `/profile` | All authenticated users | Own identity, security, sessions, and preferences |
| Settings | `/settings` | Administrator; selected views for other users | Team, general settings, and security administration |
| Organization Portal | `/portal` | Authorized organization users | Scoped inventory, orders, documents, and portal services |

The sidebar and tabs are permission-aware. A route that is visible in documentation may still be unavailable to a particular user.

---

## 5. Daily operating sequence

The recommended daily sequence is:

1. Sign in and check the Dashboard.
2. Review notifications, low-stock items, pending approvals, and exceptions.
3. Process inbound shipments through Receiving.
4. Complete inspection and putaway actions.
5. Review Master Inventory and resolve location or stock issues.
6. Create or review withdrawal requests and pick lists.
7. Perform physical picking and dispatch confirmation.
8. Review generated documents and reports.
9. Supervisors review approvals and audit activity.
10. Administrators check user, security, and system configuration when required.

---

## 6. Dashboard

### What it does

The Dashboard is the operational starting point. It summarizes current inventory, receiving activity, outgoing work, pending approvals, low-stock conditions, and recent operational activity.

### Who uses it

All internal users use the Dashboard. The data shown is filtered by the user’s authorization and financial access.

### When to use it

- at the start of a shift;
- before committing receiving or withdrawal work;
- after a stock correction or dispatch;
- when investigating a low-stock or pending-work notification.

### How to use it

1. Open **Dashboard** from the sidebar.
2. Review the summary cards and alert counts.
3. Select a card or shortcut to open the underlying operational page.
4. Treat the source page as authoritative; a dashboard card is a summary, not a transaction confirmation.

### Low-stock behavior

Low stock is evaluated against the item’s **minimum reorder level**. If the item-level level is zero, the configured general inventory threshold can act as the fallback. When stock is at or below the applicable threshold, WIMS can create an in-app low-stock notification for authorized supervisors and administrators.

Duplicate low-stock notices are suppressed for the cooldown period, normally 24 hours. Restocking above the threshold resolves the condition; the source inventory remains authoritative.

---

## 7. Receiving / Incoming

Receiving records what arrived, verifies the physical shipment, captures exceptions, and commits accepted stock to inventory.

### Who uses it

Warehouse Staff create and process floor receiving. Supervisors and Administrators oversee, confirm, and resolve exceptions.

### Where to find it

Open **Receiving / Incoming**. Use a WRR detail page for a specific shipment.

### When to use it

Use Receiving whenever goods arrive at the warehouse, whether they were pre-announced or entered manually.

### Standard receiving workflow

1. Open **Receiving / Incoming**.
2. Select **New Receiving** or open an existing WRR.
3. Match the shipment to a CIPL/pre-alert when available.
4. Confirm the organization, inventory model, shipment references, and expected lines.
5. Record actual quantities and packaging details.
6. For perishable items, capture the required manufacture and/or expiry information.
7. Generate or verify QR/carton labels when required.
8. On the floor, scan the WRR or carton label.
9. Inspect the physical goods and choose the correct disposition: store, inspect, quarantine, or exception handling.
10. Assign valid locations and complete putaway.
11. Commit the WRR once the physical count and disposition are correct.
12. Print or download the WRR receipt and retain it with the shipment record.

### Perishable items

When an item is marked **Perishable** in Enrollment, the receiving flow should require the applicable manufacture/expiry capture. If the fields do not appear:

- verify that the receiving line uses the correct item;
- confirm the item was saved as active and perishable;
- refresh the receiving page;
- ask an administrator to check the item record and receiving permissions.

Do not bypass a required date by entering a placeholder.

### Receiving controls

- A commit is idempotent; do not repeatedly click Commit after a network delay.
- Unknown or provisional items must be resolved through master data before inventory is committed.
- Damaged, short, or excess goods must be recorded as an exception rather than silently corrected.
- A quarantined lot must not become available for ordinary picking.

Detailed procedure: [Incoming Receiving & WRR](./user-manual/incoming-receiving-and-wrr.md).

---

## 8. Master Inventory

### What it does

Master Inventory is the authoritative operational view of items, lots, available quantities, locations, inspection work, and movement history.

### Who uses it

Warehouse Staff use it for stock awareness and floor work. Supervisors and Administrators use it for oversight, investigation, and approved corrections.

### How to use it

1. Open **Master Inventory**.
2. Search by item, lot, location, organization, or other available filter.
3. Open an item to view its lot and location detail.
4. Check available, reserved, quarantined, and total quantities separately.
5. Review movement history before investigating a discrepancy.
6. Use the Inspection tab for inspection and transfer-related queues where available.
7. Use the export action for an authorized operational extract.

### Quantity rules

The physical balance is based on the item’s unit structure, including boxes/cartons and standard pack quantity where applicable. Do not manually multiply quantities unless you have confirmed the item’s unit of measure and SPQ.

Inventory models must remain separated. Supplies stock is for internal use and must not be assigned to a customer transaction.

### Search and filters

Enter search terms in the search bar, choose filters, and clear filters when changing work context. If a result is not visible, confirm the active filter, organization scope, item status, and user permission before assuming the record does not exist.

Detailed procedure: [Inventory Models, Stock Balance & Withdrawals](./user-manual/inventory-and-withdrawals.md).

---

## 9. Inspection, transfer, and quarantine

Inspection protects stock that is damaged, suspect, or awaiting a quality decision.

### Who uses it

Assigned inspection staff record findings. Supervisors or authorized users resolve dispositions. Administrators retain oversight.

### How to use it

1. Open the relevant inspection queue from Master Inventory or the linked receiving/transfer record.
2. Review the lot, item, quantity, organization, and current location.
3. Record the inspection result and evidence required by the workflow.
4. Choose the permitted disposition, such as pass, partial pass, fail, quarantine, or return handling.
5. Submit the disposition.
6. Confirm that the available quantity and location state reflect the decision.

Never pick quarantined or failed stock as ordinary available stock. If a partial pass is required, keep passed and failed quantities distinct.

---

## 10. Withdrawal, picking, and dispatch

Outgoing work uses two stages so that stock is reserved before it is physically dispatched.

### Who uses it

Warehouse Staff perform physical picking and scan dispatches. Supervisors and Administrators create, review, approve, or resolve exceptions according to capability.

### Stage 1 — allocation and pick list

1. Open **Master Inventory** or **Withdrawal / Outgoing**.
2. Start a withdrawal request or load an approved request.
3. Select the organization, inventory model, requested items, quantities, and required references.
4. Let WIMS allocate stock using FIFO/FEFO rules.
5. Review the selected lots and locations.
6. If the requested sequence must be overridden, submit the approval request rather than manually bypassing the rule.
7. Generate or open the pick list.

### Stage 2 — physical pick and dispatch

1. Open the active pick list on the floor device.
2. Scan the item/carton/location QR code.
3. Confirm the scanned lot and quantity.
4. Record a discrepancy immediately if the physical stock does not match.
5. Complete the physical pick.
6. At the dispatch gate, scan and confirm the dispatch.
7. Confirm the final quantity and recipient information.
8. Generate the acknowledgement receipt and other applicable documents.

### Supplies withdrawals

Internal Supplies withdrawals follow a faster internal-use path, but still require correct item, quantity, location, and authorization. They must not be mixed with customer VMI or Trading transactions.

### Expiration and commitment controls

Pick reservations can expire. A dispatch attempt before physical picking, after an expired commitment, or against already-dispatched stock must be stopped and reported to a supervisor.

Detailed procedure: [Outgoing Picking, Logistics & Dispatch](./user-manual/outgoing-picking-and-dispatch.md).

---

## 11. Approvals

### What it does

Approvals handle exceptions that must be reviewed by an authorized person, including FIFO/FEFO overrides and other controlled operational decisions.

### Who uses it

Supervisors and Administrators with the required approval capability. The person who requested an approval cannot approve that same request.

### How to use it

1. Open **Approvals**.
2. Filter by status, type, date, requester, or source record.
3. Open the request and inspect the supporting data.
4. Choose **Approve** or **Reject** and provide the required reason.
5. Confirm the result and return to the source workflow.

An approval decision changes the controlled workflow state; it is not merely a comment. If the source record has changed, reload it before deciding.

---

## 12. Organizations, items, and locations

All master data is accessed from **Enrollment**. The canonical terms are organizations, items, and locations.

### Organizations

Use organizations for vendors, customers, end customers, and internal relationships.

1. Open **Enrollment → Organizations**.
2. Search before creating a new record.
3. Enter the legal/name, contact, email, phone, address, tax, and operating details available to your organization.
4. Assign the appropriate business relationship and inventory model.
5. Save the organization.
6. Open the organization detail page to manage roles, contacts, documents, and authorized email actions.

Deactivate an incorrect or retired organization where the workflow supports it; do not delete historical business records.

### Items

1. Open **Enrollment → Items**.
2. Create or open an item.
3. Complete the inventory model, category, subcategory, item code, unit of measure, standard pack quantity, dimensions/CBM, barcode, reorder level, active state, and perishable flag.
4. Save the item.
5. If perishable, verify manufacture/expiry capture is required in receiving.

The item’s **minimum reorder level** is the primary low-stock threshold. General inventory settings can provide fallback defaults where the item-level value is zero.

### Locations

1. Open **Enrollment → Locations**.
2. Create a location or use the bulk location generator.
3. Define the code, description, capacity, active state, and any required location attributes.
4. Check for duplicate names/codes before saving.
5. Use the location in receiving putaway and inventory movements.

Detailed procedure: [Master Data & Organizations](./user-manual/master-data-and-organizations.md).

---

## 13. Billing and Pricing

### What it does

Billing & Pricing is the office financial workspace. It separates VMI storage billing from Trading pricing and margin calculations.

### Who uses it

Finance users, Supervisors, Administrators, and any user granted `reporting.financial_read` or the specific billing capability.

Warehouse Staff and organization users should not see confidential cost, margin, or internal pricing data unless specifically authorized.

### VMI billing

1. Open **Billing & Pricing → VMI Billing**.
2. Select the organization and billing period.
3. Review CBM/utilization, applicable rates, storage duration, handling, and adjustments.
4. Open the billing period or Statement of Account.
5. Review the schedule details before issuing or downloading the document.
6. Use the period average as the VMI billing basis; a single release document is not the VMI bill.

### Trading pricing

1. Open **Billing & Pricing → Trading Pricing**.
2. Review contracts, pricing rules, rate cards, and applicable policies.
3. Confirm buy and sell prices, currency/forex inputs, and margin treatment.
4. Use the final trading price on the withdrawal and acknowledgement documents.

### SOA details

Open the relevant Statement of Account from the VMI area, then select the period and organization. If the detail view fails to load, retry once, confirm the period exists, and check financial permission before escalating.

---

## 14. Reports and Analytics

### Who uses it

Supervisors and Administrators use internal reports. Authorized organization users use only their scoped analytics. Financial cards and columns require financial reporting access.

### Where and when

Open **Reports & Analytics** for shift reviews, weekly operations meetings, inventory investigation, receiving/outgoing analysis, and approved financial review.

### How to use it

1. Choose the report or analytics section.
2. Set the date range and available organization, inventory model, status, and item filters.
3. Keep filters in one clear context; reset filters before starting a new analysis.
4. Read cards as summaries and use the underlying table/chart for detail.
5. Export only when the extract is authorized and necessary.

Common report areas include inventory KPIs, receiving volume, pick-list/withdrawal volume, activity trends, movement history, and financial summaries.

### Interpretation rules

- Confirm the date range and timezone before comparing periods.
- Distinguish available, reserved, quarantined, and total quantities.
- Treat financial figures as restricted business information.
- A report does not override the source transaction or audit log.

---

## 15. Notifications and low-stock alerts

### Notification bell

The header notification entry point shows alerts assigned to the signed-in user. Open a notification to inspect the authorized source record; clicking a notification does not automatically execute a mutation.

### Low-stock alerts

Low-stock evaluation uses the item’s reorder level, with the configured general threshold as fallback when the item level is zero. Notifications are sent to the default authorized supervisor/administrator recipients and are deduplicated during the cooldown period.

To resolve a low-stock alert:

1. Open the linked item or inventory record.
2. Verify the available quantity and open commitments.
3. Receive replenishment, correct the source transaction, or update the approved reorder level.
4. Confirm that the condition is cleared.

### Email notifications and composer

The organization detail action can open the transactional email composer. It supports:

- suggested operational email templates;
- editable subject and message;
- server-resolved organization recipient;
- CC validation;
- draft autosave;
- attachment upload within the configured limit;
- live inbox-style preview;
- Resend delivery when the Resend API and verified sender domain are configured.

The composer does not allow a user to replace the organization recipient with an arbitrary address. Email delivery must be verified in Resend; a successful UI submission should not be treated as proof of inbox delivery until the provider log confirms it.

---

## 16. Documents, PDFs, printing, and retention

### Documents generated by WIMS

Depending on the workflow, WIMS can generate or expose:

- warehouse receiving receipts;
- pre-alert and receiving documents;
- QR/carton labels;
- pick lists;
- delivery receipts;
- priced acknowledgement receipts;
- VMI statements and schedules;
- Trading documents;
- reports and authorized exports.

### Standard document workflow

1. Open **Documents** or the source transaction.
2. Review the document metadata and source status.
3. Preview before printing or downloading.
4. Confirm the organization, item/lot lines, quantity, date, pricing treatment, and signatures.
5. Download or print the PDF.
6. If reprinting, retain the reprint watermark and audit entry.

The standard document template and organization branding should be configured in Settings where available. Generated documents use the standardized footer, accountability/signature structure, print-safe page breaks, and applicable pricing confidentiality notice.

### Pricing on documents

- Trading prices on a document are final.
- VMI release pricing is a per-release reference only.
- VMI billing is based on the billing-period calculation, not a release document total.

Audit logs, lot-history exports, and generated document artifacts are retained permanently under the tiered retention policy: hot storage in Supabase for the active period, followed by verified archival rather than deletion of the historical record.

Detailed procedure: [Document Printing & Compliance](./user-manual/document-printing-and-compliance.md).

---

## 17. Profile and preferences

Open **Profile** to manage your own account information, security, active device session, and display preferences.

### Account and identity

Review your display name, employee ID, email, contact information, assigned roles, and effective permissions. Do not edit identity information to impersonate another operator.

### Security

Use the security section to change your password, configure available MFA options, review active sessions, and revoke a device session when a device is lost or no longer trusted.

### Dark mode and table density

- Dark Mode changes the application-wide palette and preserves the original logo colors.
- Compact Table Density reduces row spacing in supported tables.
- Preferences persist on the same browser/device through local storage.

If dark mode appears partly light, refresh after saving the preference and verify the browser is using the latest deployment.

---

## 18. Settings and administration

### Team

Administrators use **Settings → Team** to:

- search users by name, employee ID, email, or role;
- invite operators;
- assign or revoke dynamic roles and scopes;
- review account status;
- suspend accounts;
- resend or cancel invitations;
- open the audit log for a user;
- revoke device sessions where supported.

Always confirm the target account before suspending or revoking access. The system protects the last administrator invariant.

### General settings

Use **Settings → General** for organization-wide operational defaults such as:

- inventory thresholds and reorder defaults;
- date/time or display preferences where available;
- document/template settings;
- approved business defaults.

Save settings, then verify the affected source workflow. A setting is not proof that an item-level record changed.

### Security settings

Use **Settings → Security** for security controls, session/identity settings, and administrator-visible security activity where available.

### Audit log

The audit log is the authoritative history of security-sensitive and operationally significant actions. Use it to answer:

- who performed an action;
- what changed;
- when it changed;
- which source record was affected;
- whether the action was allowed or denied.

Audit records are historical and must not be edited or deleted through ordinary administration.

---

## 19. Organization portal

Authorized organization users open **Organization Portal** to view only their permitted information.

Available portal areas may include:

- portal dashboard;
- scoped inventory;
- orders and pick-list information;
- documents;
- organization labels and notifications where enabled.

Portal users must not expect to see internal Supplies records, unrelated organizations, confidential margins, or administrator settings. If data looks incomplete, verify the user’s organization scope first.

---

## 20. Offline, sync, and scanner use

WIMS is designed mobile-first for floor work. Use handheld scanners and touch actions where available.

- Keep the device connected when committing receiving, approving, pricing, or dispatch actions.
- Treat a disconnected or stale screen as a warning, not confirmation.
- Do not repeat a commit while waiting for a response; refresh and check the source record first.
- Scan the correct label and verify the displayed item, lot, and location.
- Report a duplicate or ambiguous scan instead of guessing.

Offline/cached views may be stale. Server authorization and source-state validation are reapplied when a transaction is submitted.

---

## 21. Error handling and troubleshooting

WIMS error messages follow three parts: **what happened, why it failed, and the next action**.

### Page says “We couldn’t load your workspace”

1. Select **Try Again** once.
2. Confirm the session is still valid.
3. Return to the Dashboard and reopen the page.
4. If only one page fails, record the URL, user, time, and action that caused it.
5. Ask an administrator to check permissions and service health.

### A tab or subtab does not open

Confirm:

- the tab is available to the user’s capability set;
- the URL is the canonical route;
- the page was refreshed after deployment;
- browser console/network errors are captured for support.

Do not manually edit IDs in a URL to access another organization’s record.

### Data management view/edit fails

Check the record’s active status, organization scope, required fields, and permission. Use the list page to reopen the record rather than relying on an old bookmarked detail URL.

### Billing or SOA detail fails

Confirm financial access, organization, billing period, and source-period existence. Retry once, then capture the period, organization, and error message for support.

### Perishable fields do not appear in receiving

Verify the item’s Perishable flag was saved, confirm the receiving line references that item, refresh the receiving page, and check the item capability/record.

### Low-stock alert does not appear

Check available stock, the item reorder level, the fallback general threshold, item active state, recipient capability, and the 24-hour deduplication window. A previously emitted alert may be suppressed until the cooldown expires.

### Email composer reports success but no email arrives

Check the Resend API key, verified sender domain, `RESEND_FROM_OPERATIONS`, deployment environment, recipient address, and Resend email logs. A local `.env.local` value does not automatically configure Vercel.

Detailed exception procedures: [Edge Cases & Troubleshooting](./user-manual/edge-cases-and-troubleshooting.md).

---

## 22. Administrator daily checklist

### Start of day

- Confirm the application loads and the health/connectivity indicator is normal.
- Review pending approvals and critical notifications.
- Review low-stock conditions.
- Confirm invited/suspended user changes are expected.

### During operations

- Monitor receiving exceptions, inspection holds, and dispatch discrepancies.
- Check that source transactions have the expected documents.
- Investigate repeated failed scans or duplicate submissions.
- Protect financial and organization-scoped information.

### End of day

- Review unresolved approvals, quarantined stock, and open commitments.
- Review audit activity for sensitive changes.
- Confirm required reports or documents were generated and retained.
- Escalate provider, email, or database failures with timestamps and correlation details.

---

## 23. Quick reference: feature ownership

| Need | Start here | Owner |
|---|---|---|
| See today’s operational status | Dashboard | All internal users |
| Record inbound goods | Receiving | Warehouse Staff / Supervisor |
| Inspect or quarantine stock | Master Inventory → Inspection | Inspector / Supervisor |
| Find item, lot, or location balance | Master Inventory | Staff / Supervisor / Administrator |
| Create or monitor a pick | Master Inventory / Outgoing | Staff / Supervisor |
| Approve an exception | Approvals | Supervisor / Administrator |
| Maintain organizations/items/locations | Enrollment | Supervisor / Administrator |
| Review VMI or Trading financials | Billing & Pricing | Finance / Supervisor / Administrator |
| Analyze trends or KPIs | Reports & Analytics | Supervisor / Administrator / scoped organization user |
| Download a PDF | Documents or source transaction | Authorized user |
| Manage users and roles | Settings → Team | Administrator |
| Change operational defaults | Settings → General | Administrator |
| Review own sessions/preferences | Profile | All authenticated users |
| View organization-scoped data | Organization Portal | Authorized organization user |

---

## 24. Related detailed guides

- [Inventory Models, Stock Balance & Withdrawals](./user-manual/inventory-and-withdrawals.md)
- [Incoming Receiving & WRR Processing](./user-manual/incoming-receiving-and-wrr.md)
- [Outgoing Picking, Logistics & Dispatch](./user-manual/outgoing-picking-and-dispatch.md)
- [Master Data & Organization Management](./user-manual/master-data-and-organizations.md)
- [Document Printing, Signatures & Compliance](./user-manual/document-printing-and-compliance.md)
- [Edge Cases & Troubleshooting](./user-manual/edge-cases-and-troubleshooting.md)

For implementation, acceptance, and administrator handover details, see the approved specifications under `specs/20-documentation-training-and-uat/`.
