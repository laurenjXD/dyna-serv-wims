# Frontend & UI/UX Implementation Plan — Dyna-Serv WIMS (all pages, all tabs)

> **For agentic workers, including autonomous overnight runs:** This plan is the single source of truth for what every page in this app must contain, how it must look, and what real backend it must call. It is built from three governing sources, cross-checked against each other — where they disagreed, the disagreement is called out explicitly rather than silently resolved:
> 1. `specs/00-steering/page-role-map.md` — **"Dyna-Serv WIMS — Page & Role Map"**, the canonical page/role/tab inventory (46 pages, 12 nav groups). This is the structural backbone of this plan.
> 2. Each page's owning feature spec (`specs/NN-*/requirements.md` + `design.md`) — all confirmed `Status: Approved` as of this plan's writing (2026-08-12). Per `CLAUDE.md`'s standing rule, no page below is worked on unless its owning spec's `tasks.md` is `Status: Approved`; this plan does not change that rule, it just pre-loads the checking so implementers don't have to re-derive it per page.
> 3. `specs/00-steering/revision-log.md` — every verified, logged decision that amended a spec after its initial approval. Where a page's behavior differs from a naive reading of its owning spec because of a later revision-log entry, this plan states the revision-log entry by name.
>
> **Backend alignment is not aspirational in this plan — it's current-state-verified.** As of tonight (2026-08-11/12), a wiring pass already replaced mock data on 9 major pages with calls to real, tested query/action functions (barcode integration, Home, Approvals, Pick/Dispatch, Transfers, Inspection, Portal ×4). Every page section below states explicitly which real functions already exist and are already wired, versus which still need wiring — so an overnight worker never re-does completed work or, worse, silently reverts it back to mock data.
>
> **Design system**: `specs/00-steering/brand-design-system.md`, "Steel & Hazard" (adopted 2026-08-12) — industrial slate structure (`brand-navy` #1E293B, `brand-royal-blue` #475569), burnt safety-orange accent (`brand-red` #9A3412, CTA-only, AAA-verified), status colors kept hue-distinct from the accent (`status-available` #10B981, `status-pending` #EAB308, `status-held` #EF4444 — one documented AA-not-AAA gap, see §1.3 of that doc), Space Grotesk headings + Inter body/data + JetBrains Mono codes. The signature pattern is the colored left-accent-bar on cards/alerts — apply it consistently, don't invent a new signature per page. Because the app is token-based, most color work is already propagated automatically; **do not hardcode hex values in any component** — the one sanctioned exception is recharts SVG props, and even those must match an already-documented §1 token exactly (see that doc's §12 governance section and the `MovementChart.tsx`/`LocationOccupancyChart.tsx` files for the established pattern).
>
> **Floor vs. office is not a suggestion.** Every page below states its `surface` (`floor` / `office` / `shared` / `party`) from the route registry (`lib/shell/registry.ts`). Floor-surface pages get mobile-first base styles, 56-64px touch targets, solid backgrounds (no glassmorphism), `active:` press feedback not `hover:`, and AAA contrast for time-critical text, per `brand-design-system.md` §3/§5. Office-surface pages may use denser tables and `hover:` states but must stay usable down to mobile width. Getting this backwards on a single page is the single most common review-agent finding in this repo's history — see `specs/00-steering/revision-log.md`'s multiple `design-system-auditor` entries.
>
> **Two known spec/page-role-map naming mismatches, resolved here so implementers don't have to re-derive them:**
> - `page-role-map.md` calls the master-data hub `/enrollment` with three tabs. Its owning spec (`06-party-and-item-enrollment`) actually models three separate sections (`/master-data/parties`, `/master-data/items`, `/locations`), each with its own list/new/detail/edit routes — not literally three tabs on one `/enrollment` page. **Resolution**: build `/enrollment` as a tab shell (matching the already-established `billing-pricing` tab-shell pattern below) whose three tabs render the three master-data sections' list views inline, with "New Party"/"New Item"/"New Location" and row-click-through still landing on the real `/master-data/*` routes for create/detail/edit. This preserves both documents' intent: one nav entry (page-role-map.md, and `lib/shell/registry.ts`'s already-implemented single `enrollment` route row), three real underlying data sections (spec 06).
> - `page-role-map.md` lists `/sync` with three tabs (Failed, Syncing, Completed) and a floor banner. Its owning spec (`03-offline-mode-and-client-storage`) does not define this exact page — it defines the underlying `outbox`/`sync_log` data model and a `@/lib/offline` status contract (`OfflineStatus` type, see that page's section below) that a `/sync` page must consume. The Failed/Syncing/Completed tab mapping onto `outbox.status`/`sync_log.outcome` is this plan's own synthesis, stated explicitly as such in that page's section, not spec text to treat as gospel.
>
> **Verification gate before any page below is marked done**: `npx tsc --noEmit` clean, the full `npx vitest run` suite green (1252 tests as of this plan's writing — a regression here blocks everything, not just the one page), and for any page whose surface is `floor` or whose tabs render both mobile and desktop, a manual/`run`-skill check at 375px width. Do not mark a page "done" on visual inspection alone.

---

## 0. How to use this plan (read before starting any page)

1. **Check the page's status marker** (🟢 Already wired tonight — restyle only / 🟡 Partially wired — some tabs/fields missing / 🔴 Not wired — full implementation needed) before starting. A 🟢 page needs the new design system applied and a careful diff against this plan's field list to catch anything the wiring pass didn't cover — it does **not** need its data layer rebuilt.
2. **Never reintroduce mock data into a 🟢 or 🟡 page.** If a page currently calls a real query function and you're "improving" it, the replacement must also call a real query function. Search the diff for `MOCK_`/`TODO: wire` before considering a page regressed back to placeholder state — this exact regression already happened once tonight (an external design-tool sync reverted real wiring back to mocks) and cost significant rework.
3. **One page (or one tab-group) per commit-sized unit of work.** Don't batch unrelated pages into one sprawling change — this repo's own convention (see `revision-log.md` throughout) is narrow, traceable, one-concern-per-pass changes.
4. **Capability gates are load-bearing, not decorative.** Every page section below states its exact capability string(s) from `lib/shell/registry.ts`/`specs/02-rbac-roles`. A page must both (a) hide/omit nav entries and content the session doesn't hold the capability for, and (b) actually enforce it server-side via `requirePermission`/RLS — per this repo's `rbac-rls-reviewer` convention, UI-only gating that isn't backed by a real server check is treated as a bug, not a stylistic choice.
5. **When a page needs a query function or Server Action that doesn't exist yet**, check `lib/db/queries/*.ts` and `lib/actions/*.ts` first (this plan lists what already exists per page) — this codebase already has more backend surface built than most pages currently use. Only write new query/action code when this plan explicitly says nothing exists yet.

---

## 1. Overview group (1 page)

### `/` — Home
**Surface:** shared · **Capability:** none (content adapts per session; every sub-item is itself capability-gated) · **Status:** 🟢 wired tonight

**What it is:** the default post-login landing screen. A read-only aggregate, not its own workflow — per `05-ui-shell-and-navigation` R11 and the 2026-08-07 "general landing page" revision-log entry that resolved the `/dashboard`↔`/reports` route collision (this page owns `/`; `16-reporting-and-analytics`'s KPI dashboard owns `/reports`, not this page — do not merge them).

**Real backend (already wired 2026-08-11/12):** `listWrrDocuments(db, { limit: 1, offset: 0, status: "receiving_in_progress" })` for `openWrrs`, `listPickLists(db, { status: "allocated" })` for `openPickLists`, `listTransferRequests(db, { status: "staged" })` for `pendingTransfers`, `listPendingApprovalRequests(db, ...)` for `pendingApprovals` — each gated individually behind its own capability check (`receiving.view`, `pick_list.read`, `transfer.view`, `fifo_override.approve`) so a user missing one capability never even triggers that query.

**Floor variant (`FloorLanding`):** "Welcome back, {firstName}" greeting (real `user_profiles.displayName`, first token only), "Shift Overview" heading, the four counts as tappable cards linking to their owning page.

**Office variant:** per-queue summary cards (Receiving/Picking/Transfers/Approvals) with open/today counts + a Recent Activity table, plus (2026-08-07 revision) an office-only 52-week activity heatmap widget shared with `/reports` (`<ActivityHeatmap>` from `16`'s component set, gated the same as the rest of that page — `reporting.read`).

**Remaining work:** apply Steel & Hazard — KPI-style count cards should use the `data-display` (Space Grotesk SemiBold) type style for the numbers, `label` (Inter SemiBold uppercase) for the caption, and the left-accent-bar signature only where a count represents something needing attention (e.g. a nonzero `pendingApprovals` on a supervisor's landing gets the bar, a routine zero-count card doesn't — don't apply the accent bar to every card indiscriminately, that defeats its purpose as a "this needs attention" signal).

---

## 2. Receiving / Incoming group (6 pages)

Inbound lifecycle: stage a WRR → scan it in at the dock → resolve exceptions → print → review the ledger. Per-line immediate commit (2026-08-10 "07 receiving reversed" revision), not one atomic end-of-WRR gate.

### `/receiving` — Receiving hub
**Surface:** shared · **Capability:** `receiving.view` · **Status:** 🟢 (pre-existing, confirmed working)

**Tabs:** Receive (quick-jump into an in-progress WRR) · WRRs (full work queue, filterable by status) · Incoming Ledger (confirmed-only, read-only `inventory_transactions` history, `movement_type='receiving'`).

**Backend:** `listWrrDocuments` (queries/receiving.ts) for the WRR queue and ledger.

### `/receiving/new` — New WRR
**Surface:** office · **Capability:** `receiving.confirm` · **Status:** 🟢

Header form: vendor (party picker, role=`vendor`/`supplier`), flow type, CIPL reference, PEZA/IP/MAWB numbers (`wrr_documents.peza_number`/`ip_number`/`mawb_mbl_number`, per the 2026-08-07 MAWB/MBL addition). Dynamic expected-lines list. **Storage location is not collected here** (2026-08-10 reversal) — removed from `wrr-line-items.tsx` per that entry's explicit file-level to-do, confirm this removal actually landed, don't just assume the plan text made it happen. Creates `wrr_documents` in `staged_pending_arrival` — nothing posts to inventory yet.

### `/receiving/[wrrId]` — WRR detail
**Surface:** floor · **Capability:** `receiving.view` · **Status:** 🟢, Task E (item-code display bug) fixed tonight

Header fields, every expected line with live scan/commit progress, current status. `WRRUnitLabelGenerator` action per line prints `N` (=`expected_qty`) unique per-unit QR labels (spec 18 §2.2) — `itemCode` prop now correctly reads `item.itemCode` (real `items.code` via a join added tonight), not the UUID bug fixed tonight.

### `/receiving/[wrrId]/receive` — Receive (floor scan)
**Surface:** floor · **Capability:** `receiving.scan` (scan) / `receiving.confirm` (Store/Hold) · **Status:** 🟢, camera integration rebuilt tonight

**Flow:** scan barcode → matched against expected line (wrong item / wrong WRR / duplicate / over-quantity / flow-type mismatch / **duplicate_unit_scan** all rejected here, the last one added tonight via the new `wrr_item_unit_scans` table) → for Store, a suggested location appears (`suggestPutawayLocations`, best-fit by remaining CBM) → for Inspect, the inspection location is confirmed first, then scanned, then Hold. One-primary-action floor screen — only the next-ready line's commit button shows.

**Real backend (rebuilt tonight after an external reset wiped the first build):** `recordScan` now checks/persists `wrr_item_unit_scans` for exact duplicate-label detection; `CameraScanBridge.tsx` wires `ReceivingCameraScanner`/`MobileQRScanner` as a secondary scan input below the manual keyboard-scanner input, submitting through the same `handleScan` Server Action — not a parallel pipeline. `getScanErrorMessage` has the `duplicate_unit_scan` case.

**Design-system note:** this is the highest-traffic floor screen in the app — the left-accent-bar signature is *already* in production use here (scan-success/scan-error cards) and is the reference implementation other floor screens should match, not reinvent.

### `/receiving/[wrrId]/print` — Print WRR
**Surface:** shared · **Capability:** `receiving.view` · **Status:** 🟢

Printable WRR: barcode, header fields, expected lines, blank scanned-qty column. A reprint is watermarked "REPRINT" with who/when (`status-pending` at 20% opacity per the doc-printing pattern in spec 10 §6) — never resets the scan baseline.

### `/inspection` and `/inspection/[id]` — Inspection queue & detail
**Surface:** shared (list) / floor (detail) · **Capability:** `inspection.perform` (scan/log) · `inspection.resolve` (Supervisor-only, resolve) · **Status:** 🟢 wired tonight, new query functions written

**Backend added tonight** (none existed before): `listInspectionCases(db, opts)` and `getInspectionCase(db, caseId)` in `lib/db/queries/transfers.ts` (inspection_cases lives in that schema file, cross-cutting between `07` inbound and `11` transfer contexts). Joins `lots`/`items`/`parties`, resolves current location via a correlated subquery (not a LEFT JOIN, to avoid row fan-out breaking pagination), resolves `qtyToInspect` via a `CASE`-driven subquery over the polymorphic `transfer_lines`/`wrr_items` source. Unit tests exist in `lib/db/queries/__tests__/transfers.test.ts`.

**Two-person separation, UI-enforced tonight:** the disposition form on `/inspection/[id]` only renders for sessions holding `inspection.resolve` — a `warehouse_staff` session (only `inspection.perform`) sees a read-only "awaiting supervisor" message instead. This mirrors `resolveInspectionCase`'s own server-side enforcement (`lib/actions/transfers.ts`) — the UI gate and the server gate must never disagree.

**Known, flagged limitation (not silently hidden):** `sourceRef` currently shows as raw `sourceRefType:sourceRefId` rather than a resolved `TRF-.../WRR-...` document number — `listTransferRequests` doesn't join to resolve that yet. Flagged for a follow-up, not treated as done.

**Follow-up review still owed** (flagged by the builder agent, not yet performed): `rbac-rls-reviewer` on the two-person-separation gate and the "no per-user assignment column" floor-scoping approximation on `/transfers`; `integration-reviewer` on the new `inspection_cases` read seam since `07` also writes to it via `wrr_item`-context cases.

---

## 3. Master Inventory group (1 page)

### `/inventory` — Master Inventory
**Surface:** office · **Capability:** `pick_list.read` · **Status:** 🟢 (pre-existing)

Owned by `01-core-data-model`, not by outbound workflow (2026-08-11 nav-group split, revision-log). **Table-with-expandable-rows pattern**, not a separate drill-down page or history modal (2026-08-07 UI-pattern decision, corrected same day from a wrongly-attributed `16` ownership to its real owner `01`).

**Tabs:** Inventory (Stock View) · Pick List · Daily Inspection.

**Collapsed row:** item code, name, UOM, stock level, status — one row per item. **Expand-on-click** reveals inline: dimensions, valuation, movement history, and a Stacked Location & Active Lots Breakdown (every active lot, lot #, vendor lot #, partition, stacked location tag, expiry, pcs/boxes/CBM, strict FEFO/FIFO order).

**Real backend:** `listStockView`/`buildStockAllocationPreview` (`lib/db/queries/inventory.ts`) — the shared FIFO/FEFO allocation engine also reused tonight by the Approvals detail page's "system recommendation" panel. **Do not duplicate this engine anywhere else in the app** — every page needing an allocation preview calls this one.

**Why dense tables are correct here despite the floor-priority rule:** this is an Inventory Controller's office audit/research task, not a floor scan-and-go screen — brand-design-system.md §9's "floor tables are a fail case" guidance is scoped to floor primary-action screens and does not apply to this office surface (explicit carve-out, 2026-08-07 entry).

**"Generate pick list" action** → hands off to `/outgoing`. **Daily Inspection** tab is the Master-Inventory-initiated entry point into the shared `/inspection` queue.

---

## 4. Outgoing / Withdrawal group (3 pages)

Two floor stages after a pick list is generated from Master Inventory: Pick (allocate/scan), then Dispatch (scan out, generate the AR).

### `/outgoing` — Outgoing hub
**Surface:** floor · **Capability:** `pick_list.execute` · **Status:** 🟢 (pre-existing)

**Tabs:** Active Picks (floor queue of in-progress picks) · Outgoing Ledger (`listOutgoingLedger`, read-only, Outgoing's counterpart to Receiving's Incoming Ledger).

### `/pick-lists/[pickListId]/pick` — Pick (Stage 1)
**Surface:** floor · **Capability:** `pick_list.execute` · **Status:** 🟢 wired tonight, one new action written

**Flow:** scan each allocated lot/location in sequence → committed quantity reserved → a FIFO/FEFO-order violation can be requested as an override.

**Real backend (corrected tonight from an initially wrong assumption):** `getPickList` + new `getPickListItems(db, pickListId)` (added to `lib/db/queries/withdrawals.ts`) for real line data. **`commitWithdrawal` is NOT what "Scan pick" calls** — that function is the *upstream* pick-list-generation command that already ran before this floor page exists; calling it per-scan would create duplicate pick lists. Instead, `handleScan` matches the scanned barcode against real `itemCode`/`lotNumber`/`locationLabel` on uncommitted `pick_list_items` rows; a new Server Action `markPickListPicked` (added to `lib/actions/withdrawals.ts` tonight, gated `pick_list.execute`) transitions `allocated → picked` when the floor user completes the line set, then redirects to Dispatch.

**Known schema gap (flagged, not worked around):** `pick_list_items` has no persisted scan-progress column — only the committed `qty` snapshot. Per-session confirmed-line tracking currently uses the same redirect-searchParams pattern as the receiving floor page, not a DB column. A future migration should add real scan-progress persistence rather than leaving this as a client-session-only concern.

**Also flagged:** no "Request FIFO override" CTA currently exists in this file, and no request-creation Server Action exists yet in `lib/actions/` (only `approveRequest`/`rejectRequest`, which are reviewer decisions, not request submission). Per `13`'s own design.md §3, this UI is explicitly "not yet built" — do not invent it under this plan without a fresh spec-writer pass first, since it needs its own approved capability/route.

### `/pick-lists/[pickListId]/dispatch` — Dispatch (Stage 2)
**Surface:** floor only · **Capability:** `dispatch.execute` · **Status:** 🟢 wired tonight

The one genuinely floor-only stage of outbound withdrawal. Each box scanned individually, or for a uniform carton run, one box scanned and quantity set directly.

**Real backend:** `getPickListItems` (reused from Stage 1) for real line data; a minimal direct `parties` select (id/name) keyed off `pickList.customerPartyId` for the party-name display (deliberately not the fully-RBAC-gated `getPartyWithRoles` helper, matching this repo's established pattern of floor pages doing scoped inline selects — see receiving's floor page selecting `locations` directly). `dispatchPickList` (`lib/actions/withdrawals.ts`) was already correctly wired before tonight's pass — generates the priced AR and posts the outbound `inventory_transactions` row, the two-stage commitment's final step.

**Known upstream gap (out of scope for this page, flagged for whoever owns `commitWithdrawal` next):** `commitWithdrawal` currently inserts `itemId` as a stand-in for `itemCode` in its `pick_list_items` snapshot — real scan-matching on both floor pages will match against this placeholder value until that upstream function is fixed to snapshot real item/lot/location data. This is a pre-existing `TODO` in `commitWithdrawal`, not something either floor page can fix locally.

---

## 5. Transfers & Inspection group (4 pages)

Internal location-to-location movement with its own request → execute → (optional) inspect lifecycle. (Inspection's list/detail pages are cross-referenced above in the Receiving group since they're shared infrastructure, not duplicated here.)

### `/transfers` — Transfers
**Surface:** shared · **Capability:** `transfer.view` · **Status:** 🟢 wired tonight

**Real backend:** `listTransferRequests` (`lib/db/queries/transfers.ts`), floor branch filtered in-app to `requestedBy === session.userId` and status in `{staged, in_progress}` — the closest available scoping since no assignee column exists on `transfer_requests` yet (flagged as a known limitation, not silently worked around: a future migration adding a real assignee/claim column would let this be a proper query-level filter instead of an approximation).

Also calls `listInspectionCases(status: 'open')` to gate the Daily-Inspection-equivalent shortcut on this page.

### `/transfers/new` and `/transfers/[id]` — New transfer / Transfer detail
**Surface:** office · **Capability:** `transfer.request` (create) / `transfer.view` (read) · **Status:** 🟢 (pre-existing)

Source/destination location, item, quantity, current status through the lifecycle. Backend: `createTransfer`, `getTransferRequest`.

### `/transfers/[id]/execute` — Execute transfer
**Surface:** floor · **Capability:** `transfer.execute` · **Status:** 🟢 (pre-existing), contrast bug fixed tonight

Start Transfer / Execute Transfer actions. **Contrast fix tonight**: the full-screen success/error flash comments referenced stale hex values from a prior palette (`#1A1B20`/`#10B981`/`#EF4444`) — now corrected to the current `on-surface` (`#0F172A`) against `status-available` (7.04:1, AAA) and `status-held` (4.74:1, AA — a documented, not-silently-claimed gap; see brand-design-system.md §1.3).

### `/transfers/[id]/inspect` — Inspect transfer
**Surface:** floor · **Capability:** `inspection.perform` (scan/log) / `inspection.resolve` (Supervisor, disposition decision) · **Status:** 🟢 (pre-existing)

Store / Hold actions. Same two-person-separation rule as `/inspection/[id]` applies here — verify both pages actually share the same gating logic rather than two independently-drifting copies of it.

---

## 6. Approvals group (2 pages)

FIFO/FEFO override requests only, today. Self-approval blocked both in UI and server-side.

### `/approvals` — Approval queue
**Surface:** office · **Capability:** `fifo_override.approve` (Supervisor only) · **Status:** 🟢, was already correctly wired (stale TODO comment removed tonight)

Every pending override request, reason category, requester, age. Requests expire after 24h unresolved. Backend: `listPendingApprovalRequests`.

### `/approvals/[approvalId]` — Approval detail
**Surface:** office · **Capability:** `fifo_override.approve` · **Status:** 🟢, real gaps fixed tonight

Target lot/pick line, requested override reason, prior decisions. Approve/Reject actions call `approveRequest`/`rejectRequest`.

**Three real fixes tonight, not just wiring:**
1. **Stale-check** (`isStale`) was unconditionally `request.status === "pending"` — now a genuine comparison of `lotLocationBalances.version` against `snapshot.allocation_version`, failing toward `stale` (not a false all-clear) if the snapshot or balance row is missing.
2. **"System FIFO recommendation"** was a hardcoded placeholder — now calls the shared `listStockView`/`buildStockAllocationPreview` engine (same one Master Inventory uses — see §3 above), not a duplicated allocation implementation.
3. **Decision-error suppression** — `approveRequest`/`rejectRequest` failures (including the self-approval rejection) previously vanished silently on a failed decision; now redirect with an error param and render via a new `getDecisionErrorMessage` mapper.

**Follow-up review owed, not yet performed** (flagged by the builder agent): this page now reads `08`-owned allocation data from a `09` surface — a cross-feature seam that should get an `integration-reviewer` pass, and the RLS implications of that cross-read should get an `rbac-rls-reviewer` pass before this is considered fully closed out.

**"You cannot approve your own request"** — enforced server-side inside `approveRequest`/`rejectRequest` itself, even if the reviewer also holds Warehouse Staff. Don't re-implement this in the page; just don't accidentally suppress the error message it returns (see fix #3 above).

---

## 7. Master Data group (1 nav entry, 3 real sections)

### `/enrollment` — Enrollment
**Surface:** office · **Capability:** Read: `parties.read` (Warehouse Staff, Supervisor, Administrator) — Write (each tab independently): `parties.manage` / `items.manage` / `locations.manage`, **Administrator only** · **Status:** 🔴 tab-shell not yet confirmed built to spec

**Corrected 2026-08-11** (revision-log): this is one page with three tabs, not four separate sidebar entries — the standalone `/master-data/parties`, `/master-data/items`, `/master-data/locations` nav rows were removed from the registry (already reflected in `lib/shell/registry.ts` — confirmed tonight, the registry only has a single `enrollment` route row). The underlying detail/new/edit routes under `/master-data/*` still exist and are still reachable as links from inside each tab (e.g. "New Party" → `/master-data/parties/new`), not as their own sidebar destination.

**Parties tab** — fields (exact, from spec 06, final — do not rename): `code`, `name`, `contact_person`, `email`, `phone`, `tax_id`, `address_1`, `address_2` (split from single `address`, 2026-08-08), `payment_terms`, `notes`, `is_active`. Business roles multi-select: `vendor` / `supplier` / `customer` / `end_customer` / `internal_warehouse` — no duplicate role per party. Party detail view gets: **"Contact Party"** action (2026-08-07, gated `parties.manage`, fixed pre-approved transactional template via Resend, never a full messaging UI, fails open) and a read-only **Transaction Ledger** (`party_transaction_ledger`, same `parties.read` gate — no new capability).

**Items tab** — fields (exact, final): `code`, `supplier_item_code`, `customer_item_code`, `dsgc_item_number`, `name`, `description`, `barcode` (unique, **immutable once the item has any `lots`/`wrr_items`/`inventory_transactions` row** — the UI must disable this field once that's true, not just document it), `item_type`, `category_id` (read-only picker, no create-category-here), `default_supplier_party_id`, `uom`, `currency`, `buying_price`/`selling_price` (nullable, reference-only — mandatory visible help text that these don't determine document/billing price), `spq`, `spq_meter` (conditional on `uom='roll'`), dimension fields (all-or-none), `volume_cm3`/`volume_cbm` (show the calculation, never let dimensions and stored volume silently disagree), `boxes_per_pallet`, `weight_kg`, `min_reorder_level`, `is_perishable`, `is_active`. One unified form — select flow type (VMI/Trading/Supplies) first, then only that flow's conditional fields appear.

**Locations tab** — fields: `zone`, `rack`, `level`, `position`, `location_type` (dropdown only: `receiving_bay`/`inspection`/`storage`/`picking`/`dispatch` — no free text), `max_cbm_capacity`, `is_active`. **`label` is never user-typed** — server auto-generates `Rack+Level-Position` (e.g. `A1-01`), shown for confirmation but the authoritative value is server-recomputed at write time. Location detail gets a read-only **Movement Ledger** (`location_transaction_ledger`, `locations.read` gate).

**Deactivation (all three tabs, identical pattern):** soft-delete only (`is_active=false`) — never hard-deleted; blocked whenever referenced by operational/document/inventory/audit records.

**Offline:** every mutation across all three tabs is Tier 2, online-only — confirmed exclusion from spec 03's Tier 1 allowlist. Location lookup (read-only) must still work on a handheld even though this surface is office-first.

**What actually needs building here:** confirm whether `app/(authenticated)/enrollment/page.tsx` exists at all yet and, if so, whether it's a real tab shell rendering the three sections' list views inline (per this plan's resolution at the top) or still a stub. This was not touched by tonight's wiring pass — start with an honest audit of current state before assuming either "done" or "not started."

---

## 8. Documents group (1 page, 2 tabs)

### `/documents` — Documents
**Surface:** office · **Capability:** `documents.read` · **Status:** 🔴 launchStatus is `planned` in the registry — this page is knowingly not yet real

Pick lists and acknowledgement receipts, in one archive. Per `lib/shell/registry.ts`, this route is marked `planned`, meaning it currently renders sample data and is correctly excluded from the nav for real sessions until it's built — **do not flip its `launchStatus` to `launch` in the registry until the tabs below are actually wired**, since the registry's `planned` flag is itself load-bearing (it controls nav visibility).

**No list/tab shell is defined in spec 10** — only two detail routes exist in that spec: `documents/pick-lists/[pickListId]/page.tsx` and `documents/acknowledgement-receipts/[receiptId]/page.tsx`. Building the tabbed list/archive shell is this plan's own synthesis on top of those detail routes plus `05`'s Shared Table-Action and Filter/Search Contract (cited by `06`/`11`/`13`/`14` already — reuse it here too, don't invent a fifth table pattern).

**Pick List tab — printed field contract** (exact, spec 10 §6.1): document number (`PL-{YYYY}-{NNNNNN}`), generation date/time, warehouse name/address, party name/code, flow type, per-line item code/name/lot/location/qty/UOM/unit CBM, commitment reference, authorized-by, printed-by, REPRINT watermark.

**Acknowledgement Receipts tab — printed field contract** (exact, spec 10 §6.2): document number (`AR-{YYYY}-{NNNNNN}`), dispatch date/time, warehouse/party/delivery-address, flow type, per-line item/lot/qty/UOM/**unit price** (conditional — see below)/line total, currency, total amount, dispatched-by/received-by/supervisor sign-off blanks, pick-list reference, REPRINT watermark.

**Critical conditional-rendering rule, easy to get wrong:** unit price on the AR is **Trading**: final, frozen `trading_price_snapshots.unit_price`; **VMI**: reference-only `items.selling_price` **plus a mandatory verbatim disclaimer** — *"Unit prices are per-release reference values only. Authoritative billing is the period VMI statement."*; **Supplies**: no price shown at all, line-total/document-total fields omitted entirely, not zeroed. A page that shows a price for Supplies, or omits the VMI disclaimer, or treats VMI's price as final, is wrong regardless of how the rest of the layout looks.

**Actions:** preview, download, print, reprint (reproduces identical content/price, never regenerates), generation-attention/retry state, history view. Storage via private `documents` bucket, 60-minute signed URLs, re-checked every time (possession of a URL alone never grants access).

**Failure UX:** floor/office user sees "Document unavailable — retry or contact supervisor" with a retry button; Supervisor gets a dead-letter alert after 3 failed attempts. Document generation failure never blocks/reverses dispatch or inventory state — this is a read/archive concern layered on top of already-committed operational reality, not a gate on it.

**Offline:** generation is Tier 2 online-only — a cached/local preview must never present as an authoritative generated document.

---

## 9. Reporting group (2 pages)

Both registered in the shell and capability-gated correctly; content is real per spec 16 but registry-marked `planned` pending the analytics build-out being fully wired end to end.

### `/billing-pricing` — Billing & Pricing
**Surface:** office · **Capability:** `reporting.financial_read` (Supervisor, Administrator only — never party users, who have their own separate `vmi_statements.read` surface via the portal) · **Status:** 🔴 needs the tab shell + both tabs built

**Not a read-only report** — both tabs are CRUD/query surfaces the actual billing engines run on. Tab shell: `billing-pricing/page.tsx` (redirects to `?tab=vmi`), `billing-pricing/vmi/page.tsx` (owned by spec 12), `billing-pricing/trading/page.tsx` (owned by spec 13). Explicitly separate from `06`'s enrollment surface — different capability/audience (financial reporting vs. master-data CRUD); `06`'s party/item detail pages should link out here via "View billing/pricing history," not duplicate this content.

**VMI tab:** party picker → CBM Ledger table, columns exactly `DATE | BEGINNING CBM | IN (CBM) | OUT (CBM) | ENDING CBM | DAILY AMOUNT` (from `vmi_cbm_ledger`, default range = current billing month) → statement history (`vmi_billing_statements`) + "Generate Statement" action for a completed month → read-only contract info (`vmi_contracts`), with editing at a separate `billing-pricing/vmi/contracts/[partyId]/edit` route. Statement generation blocked if no `forex_rates` row exists for the generation date — must prompt for a rate first, not silently fail or use a stale rate. Credit notes reduce only the *next* period's statement, never the current one retroactively.

**Trading tab:** Trading Pricing & Margin Ledger, one row per **dispatched order line**, computed on read (a query, not a nightly accrual job) — columns exactly `DATE | ORDER # | ITEM | QTY | UNIT COST | UNIT PRICE | AMOUNT | COST AMOUNT | MARGIN | MARGIN %`. **Column-level gating within this one tab**: `UNIT COST`/`COST AMOUNT`/`MARGIN`/`MARGIN %` additionally require `trading.margin_view` — without it, these four columns are **omitted from the table entirely, not shown as null/blank/asterisked**. No statement-generation action on this tab (Trading has no periodic billing cycle — each AR from spec 10 is already the final commercial document).

**Both tabs are Tier 2, online-only** — no offline mutation of pricing/billing whatsoever, no exceptions.

**Related but separate routes** (spec 13 §7, provisional — build only if/when their own tasks.md is confirmed Approved, this plan does not pre-authorize them): `trading/orders/page.tsx`, `orders/new`, `orders/[orderId]`, `orders/[orderId]/pricing` — a per-order price-setting screen distinct from the ledger above. If built, must visually distinguish draft/reference price vs. frozen final document price vs. internal margin with more than color alone.

### `/reports` — Reports
**Surface:** office · **Capability:** `reporting.read` (Supervisor, Administrator) · **Status:** 🟡 components exist, page assembly/wiring needs confirmation

KPI cards, movement-volume chart, activity heatmap, Quick Access panel — per spec 16.

**Exactly 6 KPI cards** (FR-1.2, don't add or drop any): Total Receipts (MTD), Total Dispatches (MTD), Total Lots In Stock, Total Committed Qty, Low Stock Items Count, Pending Inspections Count. Each shows value + trend arrow + % change — never color-only trend signaling.

**Page structure:** `<KpiCardGroup>` (6 cards, 3/row `lg`, 2/row `md`, 1/row base) → `<ActivityHeatmap>` (52×7 grid, trailing 52 weeks, flow-filterable — same component embedded on `/`'s office variant) → Quick Access panel (3 most recent WRRs, open pick lists, pending inspections) → `<RecentActivityFeed>`.

**Analytics domains with drill-down tables** (FR-2 through FR-7): Inventory, Receiving, Outbound/Picking, VMI, Trading (margin columns gated `reporting.financial_read`), Operational/Transfer. Filters: date range, party, flow type, item. Exports (server-side, 1000-row paginated, Excel-compatible): Inventory Snapshot, Transaction Ledger, Receiving History, Dispatch History, Connected Lot History.

**Reusable components already spec'd with full prop tables** (design.md §4, and several already exist per `components/analytics/`/`components/reporting/` — audit before rewriting): `<KpiCard>`, `<KpiCardGroup>`, `<ActivityHeatmap>`, `<TrendLineChart>`, `<BarChart>`, `<DonutChart>`, `<StockLevelTable>`, `<AlertBanner>`, `<RecentActivityFeed>`, `<FlowPartitionSummary>`.

**Lot status donut — exactly 5 statuses, exact color mapping:** `staged`→`status-pending`, `available`→`status-available`, `quarantined`→`status-held`, `depleted`→`status-neutral`, `expired`→`brand-royal-blue` at 50% opacity.

**All aggregate queries must read `lot_inventory_totals`, never raw-aggregate `lot_location_balances` directly** — this is a hard performance/correctness rule from the spec's NFRs, not a style preference. Party users see only their own party's data via RLS, not app-layer filtering. `warehouse_staff` never holds `reporting.read` — there is no floor variant of this page, full stop. Online-only; a disconnected user sees the connectivity-unavailable state, never a stale cached analytics view presented as current.

---

## 10. System group (1 page)

### `/sync` — Sync
**Surface:** floor banner + office review · **Capability:** none (gated only by whether offline sync is enabled for the session) · **Status:** 🔴 not spec'd as a concrete page — this plan's own synthesis, flagged as such

**Read this before building:** no spec text defines a `/sync` route with "Failed / Syncing / Completed" tabs. What spec 03 actually defines is the underlying data model and a status contract — this page's tab structure is `page-role-map.md`'s (and by extension this plan's) synthesis on top of that, not literal spec text. Build it, but don't cite spec 03 as having specified the exact tab names if a future audit asks.

**The real, closed allowlist of what's ever queueable (only 3 types, v1):** `receiving_scan_observation`, `pick_list_scan_observation`, `inspection_observation` — pure capture only, never lot creation, balance changes, inspection resolution, or document triggers. **Only `warehouse_staff` queues offline work** — supervisor/admin/party_user never do, so this page's floor banner and office review are showing two different populations' activity, not the same data from two angles.

**Status contract to consume** (already exported from `@/lib/offline`, design.md §9.0 — use this exact shape, don't invent a parallel one):
```typescript
export type ConnectivityStatus = "online" | "offline" | "checking";
export type SyncStatus = "idle" | "syncing" | "attention";
export interface OfflineStatus {
  connectivity: ConnectivityStatus;
  sync: SyncStatus;
  pendingCount: number;
  attentionCount: number;
  lastSyncedAt: number | null;
}
```

**Tab-to-data mapping (this plan's synthesis):** Failed → `outbox` rows where `status='failed'` or `'quarantined_actor_mismatch'`; Syncing → `outbox` rows where `status='syncing'` or `'pending'`; Completed → `sync_log` rows where `outcome='applied'`.

**Supervisor conflict-resolution actions (spec 03 §6.6 — these are real, cite them accurately):** view both the queued observation and current server state side by side; **"Accept server-side winner"** (dismisses queued entry, marks superseded in `sync_log`); **"Escalate to administrator."** **No auto-merge, ever, under any conflict class** — this is a hard rule, not a default that can be relaxed for convenience later.

**Retry policy:** entries with `attempts >= 3` and `status='failed'` are not auto-retried — they surface here for supervisor resolution instead, which is the entire reason this page exists.

**Retention (resolved 2026-08-06, use these exact numbers if the page shows any "entries older than X are removed" messaging):** cache TTL 24h; pending outbox retained 7 days; failed/quarantined/attention retained 30 days after terminal outcome; completed entries + local responses removed after 24 hours.

**Nav indicators this page's data also feeds elsewhere:** connectivity pill in top nav (Online/Offline/Syncing, always labeled, never icon-only), sync-conflict count badge on the notifications nav item — **visible to supervisor, not to the floor worker who captured the original entry.**

---

## 11. Account group (5 pages)

Personal profile open to everyone; team/user administration is Administrator-only.

### `/profile` — Profile
**Surface:** shared (reachable by floor staff) · **Capability:** none · **Status:** 🔴 needs a real layout correction, not just restyling

**This is not an office-pattern page** — it was originally spec'd with tabs/cards in an office style, but that was a confirmed design-system violation caught in the 2026-08-08 amendment: because this route is `surface: "shared"` in the registry (floor staff reach it), it must use floor defaults. **Concretely: no `<Tabs>` component** (office-only pattern) — three stacked full-page `<section>`s on one continuous scrollable page instead. Solid `surface-white` Level-2 cards, no glassmorphism, 56px minimum touch targets, `active:` press feedback not `hover:`-only, `on-surface` body text never `text-grey`, no text below 16px.

**Three sections, in order:** **Account** (avatar upload, display name, contact number), **Security** (change-password form, read-only active-sessions list from Supabase Auth metadata — cannot revoke other devices from here, MFA entry point routing to `supabase.auth.mfa.*`), **Preferences** (dark-mode toggle, density toggle: Compact vs. Standard).

**Editable by the user:** display name, contact number, notification preferences, language/locale, timezone display (Asia/Manila default). **Email is read-only** — changing it requires a separate verification flow, don't build an inline email-edit field.

**Never shown here, even read-only:** party/flow scope assignments, role assignments, activation/suspension status — those are Administrator-only, on `/settings/team`, not leaked onto every user's own profile.

### `/settings` — Settings shell
**Surface:** office · **Capability:** `users.read` to view; role/access changes are Administrator-managed · **Status:** 🟡 needs confirmation against the exact nav labels below

Administrator-only; an unauthorized session should redirect with an alert. **Known doc/route conflict, flag rather than silently pick one**: spec 21's requirements.md text says the redirect target is `/dashboard`, which no longer exists as a route (renamed to `/reports` per the 2026-08-07 revision-log entry) — redirect to `/` (the real landing page) instead, and note this correction if you touch this page, don't perpetuate the stale `/dashboard` reference.

**Layout:** secondary left-rail nav inside the main shell — Team Members / Security / General.

### `/settings/team` — Team Members
**Status:** 🔴 needs confirmation of real wiring — check for `MOCK_`/placeholder data before assuming done

`<UserManagementGrid>` — searchable/filterable, real join across `auth.users` ↔ `user_profiles` ↔ `user_roles` (per spec `02`, **not** a flat `users` table — an earlier sketch in spec 21's own design.md §3.2 describing a flat table is explicitly superseded by §4.1's real join, cite the join, not the sketch).

**Invite User flow (modal, multi-step):** Step 1 (email, display name) → Step 2 (role: Admin/Supervisor/Staff/Party Client, dropdown) → conditional party picker fades in only when "Party Client" is selected, requiring an active `party_id`. Exact Zod schema:
```typescript
inviteUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2),
  role: z.enum(["admin","supervisor","warehouse_staff","party_user"]),
  partyId: z.string().uuid().optional()
}).superRefine — party_user role requires partyId, else error on partyId field
```

**Account Suspension:** row action menu → "Suspend User" → danger-styled `<ConfirmationDialog>` with explicit confirmation → server action sets `is_active=false` and revokes active Supabase sessions.

**Audit requirement, non-negotiable:** every role assignment / suspension action logs to an audit trail with admin `user_id` + timestamp, appends a `rbac_security_events` record, and delivers a generic in-app notification to the affected user ("Your account access has been updated" — **never** names the admin or other affected users, per spec 21 §6).

### `/settings/security` — Security
**Status:** 🔴 minimal spec coverage — build only the explicitly-named surface, don't invent scope

MFA/session policy configuration at the admin level (distinct from `/profile`'s own per-user MFA entry point). Spec text here is thin beyond the nav mention — do not add SSO/SAML config or a granular capability-matrix/permission-builder UI; both are explicitly out of scope per spec 21.

### `/settings/general` — General
**Status:** 🔴 minimal spec coverage

System-wide flags — named examples: "Enable Strict FIFO override approvals" toggle, "Default Currency" setting. Keep this page to genuinely system-wide, non-per-user configuration; anything party- or role-specific belongs on Team Members instead.

---

## 12. Party Portal group (6 pages)

External-facing surface. Every query scoped to the logged-in party's own `party_id` via `AuthorizationContext.partyScopes` — **no cross-party visibility anywhere in this group, ever.** All four data-bearing pages were wired tonight; this is the most thoroughly backend-verified group in this plan.

### `/portal` — Portal home
**Surface:** party · **Capability:** none (hub, no data of its own) · **Status:** 🟢 wired tonight

Party name/flow badge resolved from `partyScopes` + `getPartyWithRoles` (`lib/db/queries/parties.ts`) — no more hardcoded "Acme Corp." Nav-card gating checks both the grant *and* the correct flow-scoped party assignment (VMI for the inventory card, Trading for the orders card), not grant-presence alone. **Fails safe** — renders an empty state, never falls through to unscoped data, when no party scope exists. New shared helper: `lib/portal/resolve-party-scope.ts`, documents that the Task 2 full multi-assignment party/flow switcher isn't built yet.

### `/portal/inventory` — Portal inventory
**Surface:** party · **Capability:** `reporting.read` (assigned_party, flowType `vmi`) · **Status:** 🟢 wired tonight

Read-only VMI inventory position — no allocation/commit controls. Real backend: new `listPartyVmiInventory(db, partyId)` in `lib/db/queries/inventory.ts`, filtering `lots.flowType='vmi' AND lots.ownerPartyId=partyId`. **Never selects `buying_price`/`selling_price`/`default_supplier_party_id`/`min_reorder_level`, never touches `inventory_transactions`** — this is a position view, not a movement/cost view. Status enum corrected tonight to the real `lot_status` values (`staged/available/quarantined/depleted/expired`, matching §9's lot-status donut mapping above — reuse the same 5-value vocabulary everywhere in the app, don't invent a second status set for this one page).

### `/portal/orders` — Portal orders
**Surface:** party · **Capability:** `pick_list.read` (assigned_party, flowType `trading`) · **Status:** 🟢 wired tonight

Trading order/pick-list history. Real backend: new `listPartyPickLists(db, customerPartyId)` in `lib/db/queries/withdrawals.ts`, filtering `pick_lists.customer_party_id`. Status enum corrected tonight to real values (`allocated/picked/dispatched` — **there is no `committed` status**, an earlier mock assumed one that doesn't exist in the schema). The ad-hoc `documentId` concept from the mock data was dropped since Documents (§8 above) is independently party-scoped — this page just links out to `/portal/documents` rather than embedding document state.

### `/portal/documents` — Portal documents
**Surface:** party · **Capability:** `documents.read` (assigned_party, spans both VMI and Trading flow) · **Status:** 🟢 wired tonight

**Tabs:** Pick Lists, Acknowledgement Receipts. Real backend: new `lib/db/queries/documents.ts` — `listPartyPickListDocuments`/`listPartyAcknowledgementReceiptDocuments`.

**Real schema gap found and correctly handled tonight, worth knowing before touching this file again:** `generated_documents` has **no `party_id` column** — only `source_type`/`source_id`. Party-scoping is resolved through the source chain: pick-list docs → `inventory_commitments.pick_list_id` → `pick_lists.customer_party_id`; AR docs → `inventory_transactions.pick_list_id` → `pick_lists.customer_party_id`. This join is documented in the query file's header — treat it as required, not optional, if you touch this file.

Status enum corrected to real `generated_documents.status` values (`pending/generating/ready/failed/voided`); Download buttons disabled unless `status === "ready"`.

**Known, explicitly-flagged limitation, not faked:** the Download button has no real signed-URL generation to call yet — no such infrastructure exists anywhere in the codebase (confirmed via repo-wide search tonight). Leave it disabled with an honest state rather than wiring a fake download. **VMI billing-statement download is separately, deliberately blocked on the Task 1 approval gate** (pre-existing, unrelated note — don't conflate the two blocked-download reasons when writing UI copy).

### `/portal/notifications` — Portal notifications
**Surface:** party · **Capability:** `notifications.read` (assigned_party) · **Status:** 🔴 registry `launchStatus: planned` — correctly not yet built, don't build ahead of the notifications feature (spec 14) landing

### `/portal/labels` — Portal labels
**Surface:** party · **Capability:** `shipment_labels.generate` (assigned_party, vendor/supplier role only, not a customer role on the same party) · **Status:** 🔴 registry `launchStatus: planned`

Pre-arrival shipment-label generation for an inbound advance notice — ties into `wrr_advance_notices`/spec 22 R11's already-approved supplier-initiated pre-labeling flow. Do not build ahead of that flow's own runtime implementation status; check `specs/22-parties-portal/tasks.md` before starting.

---

## 13. Cross-cutting checklist (apply to every page above, not just some)

- [ ] Capability gate matches the exact string in `lib/shell/registry.ts` for this route — not a paraphrase, the literal `resource.action` string, and it's enforced both in nav visibility (`filterVisibleRoutes`) and server-side (`requirePermission`/RLS).
- [ ] No `MOCK_`/`TODO: wire` markers remain — grep for them before marking a page done.
- [ ] Colors and type are Tailwind token classes (`bg-brand-navy`, `text-status-held`, `font-heading`), never a raw hex value, except the sanctioned recharts SVG-prop exception, and even then only an exact match to an already-documented §1 token.
- [ ] Floor-surface pages: 56-64px touch targets, solid backgrounds, `active:` not `hover:`, AAA contrast on time-critical text, single primary action.
- [ ] Office-surface pages: usable down to mobile width even though desktop is primary.
- [ ] Party-scoped pages: every query filtered by `partyScopes`, fails safe (empty state) when no scope exists — never falls through to unscoped data.
- [ ] `npx tsc --noEmit` clean and `npx vitest run` fully green before considering the page done — a regression anywhere blocks everything, this is a shared codebase state, not a per-page sandbox.

---

## 14. Suggested execution order for an unattended/overnight run

Work in this order — later groups depend on earlier ones being stable (shared components, the allocation engine, the party-scope helper), and this order front-loads the highest-uncertainty items (🔴 pages with real spec-vs-reality gaps to resolve) while the most context is fresh:

1. **Verify, don't rebuild, every 🟢 page** against this plan's field lists first (§2–§6, §12) — fast, catches drift, establishes a known-good baseline before touching anything uncertain.
2. **`/enrollment`** (§7) — 🔴, blocks nothing else but is high-value and has a clear, fully-specified field contract to build against.
3. **`/documents`** (§8) — 🔴, but the printed-field contracts are exact and unambiguous; build the tab shell using `05`'s already-established Shared Table-Action Contract.
4. **`/billing-pricing`** (§9) — 🔴, most complex remaining page (two tabs, column-level capability gating, cross-spec ownership) — do this once the simpler 🔴 pages are done and the pattern for tab shells is proven out on `/enrollment`/`/documents`.
5. **`/reports`** (§9) — 🟡, mostly component assembly against already-spec'd props; verify existing `components/analytics/`/`components/reporting/` files against the exact prop tables before writing new ones.
6. **`/sync`** (§10) — 🔴, lowest spec-certainty page in this plan; build conservatively against the stated `OfflineStatus` contract, flag any further synthesis explicitly in code comments the way this plan does.
7. **`/profile` + `/settings/*`** (§11) — 🔴/🟡, `/profile`'s floor-pattern correction is the one genuinely tricky part; the `/settings` sub-pages are comparatively mechanical once the Team Members grid/invite-flow pattern is established.
8. **Cross-cutting pass**: run the §13 checklist against literally every page in this document, including the 🟢 ones, as a final sweep — this is the pass most likely to catch a design-system-auditor-class finding before a human does.

At each numbered step: `npx tsc --noEmit` && `npx vitest run` clean before moving to the next step. If either fails, stop and fix before proceeding — do not accumulate a backlog of red pages hoping a later step fixes an earlier one incidentally.
