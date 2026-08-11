# Dyna-Serv WIMS — Page & Role Map
Operational reference · 2026-08-10
Every page, every role, every action
A full map of the Dyna-Serv WIMS authenticated app: what each screen is for, who can open it, what tabs live inside it, and what you can actually do there. Grouped the same way the office sidebar groups them.

## Who sees what
Four roles, additive — a person can hold more than one at once (e.g. the bootstrap admin account also holds Supervisor, since Administrator deliberately has no floor/office operational grants of its own).

**Warehouse Staff**
floor · scan-driven
Receives, scans, picks, dispatches, transfers, inspects. Can request a FIFO override but not approve it. Cannot approve, manage master data, or see financials.

**Supervisor**
floor + office
Everything Warehouse Staff has, plus: approve FIFO overrides, resolve inspections, read financial/reporting data, read the audit log. The only role that can approve.

**Administrator**
office · access & master data
Manages parties, items, locations, forex rates, notification rules, user access. Deliberately holds no floor/office operational grants (no receiving, picking, dispatch) — access administration is kept separate from running the warehouse.

**Party User**
party portal only
External VMI/Trading party logged into their own scoped view — their own inventory position, orders, documents, notifications. Every grant is assigned_party-scoped; never sees another party's data.

## Overview
Receiving / Incoming
Master Inventory
Outgoing / Withdrawal
Transfers & Inspection
Approvals
Master Data
Documents
Reporting
System
Account
Party Portal

### Overview 1 page
The default landing screen after login — a read-only summary, not its own workflow.

**Home**
`/`
Shared | Launch
**Who:** Everyone signed in — the office/floor content adapts per session type; capability is none
**Shows:** A read-only aggregate of open receiving, picking, transfer, and approval items pulled from those features' own capability-gated queries — this page invents no data or capability of its own.
**Actions:** None directly — every item links out to its owning page. Deliberately carries no KPI/financial figures (that's Reports' job).

### Receiving / Incoming 6 pages
Inbound lifecycle: stage a WRR from a CIPL/packing list, scan it in at the dock, resolve exceptions, print, review the ledger. As of the 2026-08-10 amendment, storage location is suggested after a scan (not pre-picked at staging), and each line posts to inventory the moment it's stored/held — not in one batch at the end.

**Receiving hub**
`/receiving`
Shared | Launch
**Who:** Warehouse Staff, Supervisor — receiving.view
**Tabs:** Receive, WRRs, Incoming Ledger
**Shows:** Receive: quick jump into an in-progress WRR. WRRs: the full work queue, every status, filterable. Ledger: confirmed-only, read-only movement history.
**Actions:** Open a WRR, Start a new WRR

**New WRR**
`/receiving/new`
Office | Launch
**Who:** Warehouse Staff, Supervisor — receiving.confirm
**Shows:** Header form (vendor, flow type, CIPL reference, PEZA/IP/MAWB numbers) plus a dynamic expected-lines list. Storage location is not collected here anymore — it's picked on the floor once the system knows what's actually being scanned.
**Actions:** Add / remove line, Create WRR
*Creates the WRR in staged_pending_arrival — nothing is in inventory yet.*

**WRR detail**
`/receiving/[wrrId]`
Floor | Launch
**Who:** Warehouse Staff, Supervisor — receiving.view
**Shows:** Header fields, every expected line with live scan/commit progress, current status.
**Actions:** Print, Scan / Receive Items →

**Receive (floor scan)**
`/receiving/[wrrId]/receive`
Floor | Launch
**Who:** Warehouse Staff, Supervisor — receiving.scan to scan, receiving.confirm to Store/Hold
**Flow:** Scan barcode → matched against the expected line (wrong item / wrong WRR / duplicate / over-quantity / flow-type mismatch all rejected here) → line fills up → for a Store line, a suggested location appears (best-fit by remaining CBM, overridable) and one line at a time gets the primary Store action; for an Inspect line, the inspection location is confirmed first, then scanned, then Hold. Each tap posts that line to inventory immediately — the WRR flips to confirmed only once every line is done.
**Actions:** Scan, Store, Hold
*One-primary-action floor screen — only the next-ready line ever shows its commit button; others wait their turn.*

**Print WRR**
`/receiving/[wrrId]/print`
Shared | Launch
**Who:** Anyone holding receiving.view
**Shows:** The printable WRR — barcode, header fields, expected lines, blank scanned-qty column.
**Actions:** Print, Reprint
*A reprint is watermarked "REPRINT" with who/when — it never resets the scan baseline.*

**Inspection queue & detail**
`/inspection` · `/inspection/[id]`
Shared | Launch
**Who:** Warehouse Staff, Supervisor — inspection.perform to scan/log; inspection.resolve (Supervisor only) to decide disposition
**Shows:** Quarantined lots awaiting a decision, fed from receiving discrepancies, held/rejected lines, and transfer inspection.
**Actions:** Log conformance, Resolve: Accept / Quarantine / Return to Vendor
*Resolution is Supervisor-only by design — the same floor worker who scanned can't also be the one who clears it.*

### Master Inventory 1 page
A distinct page from Outgoing/Withdrawal — this is the Inventory Controller's audit/research surface, owned by the core data model spec rather than by outbound workflow. Dense table, not a floor scan-and-go screen.

**Master Inventory**
`/inventory`
Office | Launch
**Who:** Warehouse Staff, Supervisor — pick_list.read
**Tabs:** Inventory (Stock View), Pick List, Daily Inspection
**Shows:** Table-with-expandable-rows. Collapsed row: item code, name, UOM, stock level, status — one row per item. Click a row to expand inline (no navigation away) into dimensions, valuation, movement history, and a Stacked Location & Active Lots Breakdown: every active lot for that item, its lot #, vendor lot #, partition (VMI/Trading/Supplies), stacked location tag (e.g. A1-01), expiry, pcs/boxes/CBM — ordered in strict FEFO (perishable) / FIFO (non-perishable) sequence, so a lot number's own row shows every location it's dispersed across.
**Actions:** Expand row / drill down, Preview allocation, Generate pick list
*Generating a pick list here → print or save → hands off to the Outgoing page for the floor stages below. Daily Inspection is the Master-Inventory-initiated entry point into the shared Inspection queue.*

### Outgoing / Withdrawal 3 pages
Where a pick list generated in Master Inventory actually gets executed. Two floor stages: Pick (allocate/scan against FIFO/FEFO), then Dispatch (scan out, generate the AR). The dispatch scan is the one truly floor-only step in the whole outbound flow.

**Outgoing**
`/outgoing`
Floor | Launch
**Who:** Warehouse Staff, Supervisor — pick_list.execute
**Tabs:** Active Picks, Outgoing Ledger
**Shows:** Landing point after a pick list is generated/printed from Master Inventory — the floor's own queue of in-progress picks, plus a read-only confirmed-movements ledger (Outgoing's counterpart to Receiving's Incoming Ledger).

**Pick (Stage 1)**
`/pick-lists/[pickListId]/pick`
Floor | Launch
**Who:** Warehouse Staff, Supervisor — pick_list.execute
**Flow:** Scan each allocated lot/location in sequence → committed quantity reserved → a FIFO/FEFO-order violation can be requested as an override (needs Supervisor approval elsewhere before it clears).
**Actions:** Scan pick, Request FIFO override

**Dispatch (Stage 2 — withdrawal scan)**
`/pick-lists/[pickListId]/dispatch`
Floor only | Launch
**Who:** Warehouse Staff, Supervisor — dispatch.execute
**Flow:** The last stage of outbound withdrawal, and the one step that's genuinely floor-only rather than an office action wearing a floor badge. Each box is scanned individually as it leaves — or, for a uniform carton run, one box is scanned and the quantity set directly rather than repeating the scan per box.
**Actions:** Scan box, Set quantity, Dispatch
*Completing dispatch generates the priced acknowledgement receipt (AR) and posts the outbound inventory transaction — the two-stage commitment's final step.*

### Transfers & Inspection 4 pages
Internal location-to-location movement, with its own request → execute → (optional) inspect lifecycle.

**Transfers**
`/transfers`
Shared | Launch
**Who:** Warehouse Staff, Supervisor — transfer.view
**Actions:** New transfer, Cancel

**New transfer / Transfer detail**
`/transfers/new` · `/transfers/[id]`
Office | Launch
**Who:** Warehouse Staff, Supervisor — transfer.request to create, transfer.view to read
**Shows:** Source/destination location, item, quantity, and current status through the lifecycle.

**Execute transfer**
`/transfers/[id]/execute`
Floor | Launch
**Who:** Warehouse Staff, Supervisor — transfer.execute
**Actions:** Start Transfer, Execute Transfer

**Inspect transfer**
`/transfers/[id]/inspect`
Floor | Launch
**Who:** Warehouse Staff, Supervisor — inspection.perform; disposition decision needs inspection.resolve (Supervisor)
**Actions:** Store, Hold

### Approvals 2 pages
FIFO/FEFO override requests only, today. Self-approval is blocked both in the UI and server-side.

**Approval queue**
`/approvals`
Office | Launch
**Who:** Supervisor only — fifo_override.approve
**Shows:** Every pending FIFO/FEFO override request, reason category, requester, age. Requests expire after 24h unresolved.

**Approval detail**
`/approvals/[approvalId]`
Office | Launch
**Who:** Supervisor only — fifo_override.approve
**Shows:** The target lot/pick line, requested override reason, prior decisions.
**Actions:** Approve, Reject
*"You cannot approve your own request" — enforced even if you also hold Warehouse Staff.*

### Master Data 1 page
Corrected 2026-08-11: this is one page with three tabs, not four separate sidebar entries. /master-data/parties, /master-data/items, and /master-data/locations used to have their own top-level nav rows, duplicating exactly what Enrollment's tabs already showed — those rows were removed from the registry. The detail/new/edit routes under /master-data/* still exist and are still reachable, just as links from inside Enrollment's tabs (e.g. "New Party"), not as their own sidebar destination.

**Enrollment**
`/enrollment`
Office | Launch
**Who:** Read: Warehouse Staff, Supervisor, Administrator — parties.read. Write (each tab): Administrator only — parties.manage / items.manage / locations.manage
**Tabs:** Parties, Items, Locations
**Shows:** Parties: code, legal name, contact, tax ID, PEZA address, notes, multi-role flags (Vendor / Supplier / Customer / End-Customer / Internal Warehouse). Items: one unified form, not three separate ones — select flow type (VMI / Trading / Supplies) first, then only that flow's conditional fields appear (VMI: supplier + SPQ; Trading: currency + buy/sell price; Supplies: reorder threshold), then flow-scoped category/subcategory, packaging, CBM — all writing to the one unified items table. Locations: zone/rack/level/position, auto-generated label (e.g. A1-01), location type (receiving bay / inspection / storage / picking / dispatch), max CBM & weight capacity.
**Actions:** Select flow type (Items), Create, Save Changes, Confirm Deactivate
*"Deactivate" is a soft-delete (sets a row inactive) on all three tabs — nothing is ever hard-deleted from Parties/Items/Locations.*

### Documents 1 page
Pick lists and acknowledgement receipts, in one archive.

**Documents**
`/documents`
Office | Planned
**Who:** Warehouse Staff, Supervisor, Administrator — documents.read
**Tabs:** Pick Lists, Acknowledgement Receipts
**Note:** Registered in the shell but not yet a real capability-gated data source — currently sample data pending the document-generation pipeline landing.

### Reporting 2 pages
Both are wired into the shell's route registry and gated correctly; content is placeholder pending Spec 16's analytics build-out.

**Billing & Pricing**
`/billing-pricing`
Office | Planned
**Who:** Supervisor, Administrator — reporting.financial_read
**Tabs:** VMI, Trading
**Shows:** Not a read-only report — both tabs are CRUD enrollment-style forms for the pricing inputs those billing engines run on. VMI: per-party contract terms — CBM-day storage rate, inbound/outbound handling fees, contracted CBM threshold before surcharge, billing currency. Trading: per-customer pricing/margin policy that resolves the buy-cost/sell-price snapshot frozen onto each order line.
**Actions:** Create / edit contract, Set rate, Save
*This is where the numbers the ledgers report on come from — the actual generated statements/snapshots live under each party's own VMI billing / Trading order history, not here.*

**Reports**
`/reports`
Office | Planned
**Who:** Supervisor, Administrator — reporting.read
**Shows:** KPI cards, a movement-volume chart, activity heatmap, Quick Access panel.

### System 1 page
Offline-sync visibility — the floor shows only a banner; the full conflict review lives here.

**Sync**
`/sync`
Floor banner + Office review | Launch
**Who:** Everyone signed in — none, gated only by whether offline sync is enabled for the session
**Tabs:** Failed, Syncing, Completed
**Shows:** Every queued Tier 1 offline operation and its outcome. Only scan/reconciliation capture is ever offline-queueable — approval, pricing, confirmation, and FIFO allocation are online-only and never appear here as "queued."

### Account 5 pages
Personal profile is open to everyone; team/user administration is Administrator-only.

**Profile**
`/profile`
Shared | Launch
**Who:** Everyone signed in — none
**Shows:** Your own name, contact info, active roles (read-only), session details.

**Settings, Team, General, Security**
`/settings` · `/settings/team` · `/settings/general` · `/settings/security`
Office | Launch
**Who:** Administrator — users.read to view; role/access changes are Administrator-managed
**Shows:** Team: user list, roles, party scopes. General: org-level config. Security: password/session policy.
**Actions:** Assign role, Reset password, Deactivate user

### Party Portal 6 pages
The external-facing surface. Every query here is scoped to the logged-in party's own party_id — there is no cross-party visibility anywhere in this group.

**Portal home**
`/portal`
Party | Launch
**Who:** Party User — none (hub, no data of its own)

**Portal inventory**
`/portal/inventory`
Party | Launch
**Who:** Party User — reporting.read (assigned_party)
**Shows:** Your VMI inventory position — read-only, no allocation/commit controls.

**Portal orders**
`/portal/orders`
Party | Launch
**Who:** Party User — pick_list.read (assigned_party)
**Shows:** Trading order/document history — your own pick lists, past and present.

**Portal documents**
`/portal/documents`
Party | Launch
**Who:** Party User — documents.read (assigned_party)
**Tabs:** Pick Lists, Acknowledgement Receipts
**Note:** VMI billing-statement download is still blocked on the Task 1 approval gate.

**Portal notifications**
`/portal/notifications`
Party | Planned
**Who:** Party User — notifications.read (assigned_party)

**Portal labels**
`/portal/labels`
Party | Planned
**Who:** Party User holding a vendor/supplier role (not a customer role on the same party) — shipment_labels.generate (assigned_party)
**Shows:** Pre-arrival shipment-label generation for an inbound advance notice.

Sources: lib/shell/registry.ts (routes, capabilities, surfaces, nav groups) · specs/02-rbac-roles/design.md §3.2 (role grants) · specs/07-incoming-receiving/design.md (2026-08-10 amendment) · direct page reads for tab structure and action labels. "Planned" = registered in the shell but not yet built on real data.

Updated 2026-08-11: registry now matches this doc exactly — Master Inventory split into its own nav group, Receiving/Outbound renamed to Receiving / Incoming and Outgoing / Withdrawal, and Master Data consolidated to the single Enrollment entry. All changes verified against real tests, not just this doc.
