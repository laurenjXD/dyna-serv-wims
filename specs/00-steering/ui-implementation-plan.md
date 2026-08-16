   # UI Implementation Plan — Page-by-Page Build Priorities

Status: Working plan
Updated: 2026-08-16

This is the execution plan for `ui-ux-design-plan.md`. It does not re-approve
anything — every page below is still governed by its owning feature spec
(`specs/NN-*/tasks.md`, already `Approved`). Design tokens are already in
`tailwind.config.ts` — this is wiring and layout, not a rebrand.

**Page set is closed:** we build only the pages that appear in the design
doc's §4 Page & Role Map. No standalone page for anything else.

**Build unit is the page, both ends at once.** Each priority below lists its
**Database** work, **Backend** work (queries/actions/routes), and **Frontend**
work together. A page isn't "done" until all three are — partial credit on
one layer doesn't count.

## Alignment with `per page specs.md` (2026-08-16)

A second design companion doc (`specs/00-steering/per page specs.md`, "PART 2: PER-PAGE SPECIFICATIONS") was added and cross-checked against this plan and `ui-ux-design-plan.md`. It's additive Bento-box layout detail for pages already in this plan (Mega-Card patterns, field orders, button copy, SOA layout, approval detail-view fields) — no restructuring needed there. Two items required an explicit decision rather than silent resolution:

- **Auth/Login page redesign** (split-screen Bento layout, Magic Link, 3-part auth errors) — described in that doc's §1 but not previously in this plan's priority list. **Deferred, not scheduled** — `/login` stays as-is until this is explicitly picked up later.
- **Approval-monitoring badge placement** — `ui-ux-design-plan.md` §4.1 says sidebar (next to the "Approvals" nav link); `per page specs.md` §2 says the floating header pill. **Decision: both.** The badge appears in the sidebar next to the Approvals nav entry AND in the header pill alongside search/connectivity — not an either/or. Neither is built yet (currently only a Dashboard KPI card); build both mount points when P8 (Approvals) is picked up, reading the same pending-approval-count source so they never disagree with each other.

## Scope corrections from the design doc (locked in this session)

- **No standalone Notifications page.** Notifications live in the shared
  top navbar (bell icon + dropdown/panel), present and consistent on every
  authenticated page. The design doc's §4.9 Organization Portal notifications
  and the Dashboard's "Notifications" line item both resolve to this same
  navbar component reading the same `notifications` table — not separate UI.
  `app/(authenticated)/portal/notifications/page.tsx` gets deleted once the
  navbar bell ships; its content was already just a mock stand-in for this.
- **No standalone AI Chatbot page.** The three-persona assistant (`15`) is a
  floating chathead — a persistent launcher (bottom-right, above the floor
  mobile tabs but never blocking the primary CTA) that opens a popup/panel
  in place. It mounts once in the shared shell and is available on every
  page, not routed to. **It is also last in build order, on purpose:** it
  doesn't start until every other page (P1–P11) is fully built and
  functional — see P12.

## 0. Backend readiness snapshot

| Spec | Area | Status |
|---|---|---|
| 01, 02, 06, 07, 08, 09, 11, 16, 18 | Core data, RBAC, Enrollment, Receiving, Withdrawal, Approvals, Transfer/Inspection, Reporting, Barcode | **Real** — schema, migrations, queries/actions wired, live Supabase |
| 10 | Pick List / Acknowledgement Receipt | **Partial** — queries exist; no index route; AR document generation TODO |
| 17 | Categorization | **Partial** — table + dropdown read only; no CRUD |
| 21 | Profile/Settings | **Partial** — Profile + Team real; General/Security placeholders |
| 22 | Parties Portal | **Partial** — Home/Orders/Inventory real; Labels mock; Documents download TODO |
| 12 | VMI Billing | **Not started** |
| 13 | Trading Pricing/Margin | **Not started** |
| 14 | Notifications/Alerts | **MVP slice done** (2026-08-16) — `notifications` table + bell shipped; full router/email/Realtime/alert-engine still deferred |
| 15 | AI Chatbot | **Not started** |

## Priority order

Cross-cutting shell pieces first (every page depends on them), then floor
flows (highest business criticality per design-doc §2), then office/admin,
then the fully-blocked backend builds. The AI chathead (P12) is deliberately
last of all — it does not start until P1–P11 are fully built and functional.

---

### P0 — Shared shell (build once, blocks every page below)

**Database:** none new — reuses existing `parties`/`items`/RBAC tables for
search and profile display.
**Backend:** none new beyond existing `lib/rbac/session.ts` for
capability-filtered nav.
**Frontend:** floating pill header (global search, connection status,
profile), floating desktop sidebar, floating bottom pill mobile tabs
(hidden during active scan loops). Audit existing `ShellChrome`/
`ShellNavigation` against design-doc §5 rather than rebuilding. Owner:
`05-ui-shell-and-navigation` via `/implement-feature`.

---

### P1 — Notifications (navbar bell, not a page) — DONE (MVP slice, 2026-08-16)

**Database:** `notifications` table shipped (`supabase/migrations/
0026_notifications.sql`, `lib/db/schema/notifications.ts`) — recipient,
category, title, body, source_type/source_id, flow_type, created_at,
read_at, expires_at. Real-Postgres verified: RLS enforces recipient-only
read/update, no INSERT/DELETE for ordinary sessions. Trimmed from `14`'s
full design.md §3 model — `notification_deliveries`, `notification_
preferences`, `alert_rules`, `inventory_alert_events` are explicitly
deferred (email delivery / alert-rule engine phases). See revision-log's
"`14` — P1 MVP slice scoped" entry for the full scoping rationale.
**Backend:** `lib/db/queries/notifications.ts` (`getUnreadNotificationCount`,
`listRecentNotifications`), `lib/actions/notifications.ts`
(`markNotificationReadAction`, RLS-enforced via `withRlsTransaction`).
`resolveShellNotifications()` Server Action in `app/(authenticated)/
actions.ts` feeds the bell. `lib/notifications/{dedup,templates,
recipient-resolution}.ts` remain correct-but-unused pure logic — no event
producers wired yet, so there's nothing for them to process.
**Frontend:** real bell + badge in `ShellChrome.tsx` (desktop + mobile,
56px floor touch target, 16px badge text), non-menu popup pattern (matches
the account popup), empty state genuinely renders "No notifications" since
no producer exists yet — honest, not mocked.
**Deferred to later work** (not forgotten, tracked in revision-log): the
durable outbox/event router (`07`/`08`/`09`/`10`/`11`/`13` producers
actually creating rows), Resend email delivery, Realtime signals,
`notification_preferences` UI, and the `alert_rules`/threshold-evaluation
job. The bell is real infrastructure ready for those to plug into.

---

### P2 — Dashboard (`/`)

**Database:** none new (reads existing tables + P1's `notifications`).
**Backend:** already real — `lib/analytics/queries`. Add the notifications
feed read once P1 ships.
**Frontend:** KPI cards, weekly transaction line graph, monthly outgoing KPI,
approval-monitoring badge (reuses P1 bell's unread count for consistency).

---

### P3 — Receiving (Work Queue / Receive / WRRs / Incoming Ledger)

**Database:** none new — `0012`, `0020`–`0022`, `0025` already cover WRR
disposition, putaway, unit scans.
**Backend:** already real — `lib/receiving/*`, `lib/actions/receiving.ts`.
**Frontend:** apply P0's Mega-Card (office) and floor card-list (mobile)
patterns; verify item-barcode generation/reprint against design-doc §4.2.
Highest floor-priority page — validate scan flow at 375px/430px first.

---

### P4 — Inventory (Stock View / Pick Lists / Inspection)

**Sidebar/IA decision locked 2026-08-17**: Transfers and Inspection are
**no longer separate pages**. `/inventory`'s Inspection tab becomes the
one canonical, fully-merged queue — transfer requests and inspection cases
combined into a single list (not two sub-sections), each row distinguished
by type/badge and linking to its own real detail route
(`/transfers/[transferId]`, `/transfers/[transferId]/execute`,
`/transfers/[transferId]/inspect`, `/inspection/[id]`). `/transfers` and
`/inspection` retire as top-level pages, becoming `redirect()`s into
`/inventory?tab=inspection` (same pattern already used for
`/master-data/*` → `/enrollment`), and both lose their `lib/shell/registry.ts`
nav entries — Master Inventory is the sole entry point. This is real,
Milestone-2-critical-path work, not deferred — see
`multi-agent-work-division.md`'s Track A scope.

**Database:** none new for Stock View/Inspection/Transfers-merge — the
combined queue is a new query composing two already-real tables
(`transfer_requests`, `inspection_cases`, both via `lib/db/queries/transfers.ts`),
not new schema. Pick Lists needs no new table either — `pick_lists` schema
already exists.
**Backend:** Stock View already real. Pick Lists: queries (`listPickLists`)
exist but are unused by a top-level route — wire them. **New**: a combined
`listInspectionAndTransferQueue`-style query merging `listTransferRequests`
+ `listInspectionCases` into one normalized, sortable row shape, respecting
each item's own capability gate (`transfer.view`, `inspection.perform`)
independently — a user missing one capability still sees the other type's
rows, not an all-or-nothing tab.
**Frontend:** Stock View — expandable item→lot→location, lot history/aging,
Excel export (export path already in `lib/analytics/queries/export.ts`).
Pick Lists — **build the missing `app/(authenticated)/pick-lists/page.tsx`
index route**, FIFO/FEFO allocation preview (backend already in
`lib/withdrawal/allocation.ts`). Inspection tab — rebuild as the merged
queue described above; rename tab label "Daily Inspection" → "Inspection"
(this also happens to match CLAUDE.md's already-approved UI terminology,
"Inspection replaces Daily Inspection" — a happy alignment, not a new rule).

---

### P5 — Pick and Dispatch (scan flow)

**Database:** none new.
**Backend:** already real end-to-end (`08`, `10`).
**Frontend:** already wired (`pick-lists/[id]/pick`, `/dispatch`) — apply
P0's scan-flow shell, validate mismatch/override/final-dispatch states at
375px/430px. Second floor-priority page after Receiving.

---

### P6 — Outgoing (Ledger / Logistics)

**Database:** check whether `Add Charges` (charge reason, amount, evidence)
has a backing table — if not, small migration needed here.
**Backend:** Ledger real. Logistics (delivery/PEZA refs, manual status,
Add Charges) — extend `lib/db/queries/withdrawals.ts`/`lib/actions/
withdrawals.ts` if charges aren't modeled.
**Frontend:** Ledger real; build/finish Logistics tab per design-doc §4.5.

---

### P7 — Master-Data (Organizations / Items / Locations)

**Correction (2026-08-17):** the 2026-08-16 entry below calling this a
"real gap" was a **false positive** — `/master-data/items/page.tsx` (and
`/locations`, `/parties`) already deliberately `redirect()` to
`/enrollment`'s tabs, per an existing 2026-08-11 decision documented in
that file's own header comment (the decision itself was never logged in
`revision-log.md`, which is why it wasn't found on the first pass — logged
retroactively now). **No registry rows needed** — `/enrollment` is the
correct, sole Master Data nav destination, exactly as already built. The
`/master-data/*` list pages stay as redirects for old bookmarks/deep
links; their `/new`, `/[id]`, `/[id]/edit` sub-routes remain real,
reachable via drill-in from `/enrollment`'s tabs, not top-level nav.

**Database:** none new.
**Backend:** already real.
**Frontend:** apply Inventory-Model → Category → Subcategory → Item Code →
UOM → CBM/Pallet Info → Barcode → Perishability field order to the Items
tab per design-doc §4.6 and `per page specs.md` §8; "Deactivate," never
"Delete," button copy; bulk location generator UI for Locations.

---

### P8 — Approvals, Reports & Documents

**Renamed from "Approvals, Transfers, Reports & Documents"** — Transfers
moved to P4 per the 2026-08-17 sidebar/IA decision (merged into Master
Inventory's Inspection tab, `/transfers` retired to a redirect). Not this
priority's concern anymore.

**Database:** none new for Approvals. Documents needs `generated_documents`
coverage confirmed for AR generation (currently TODO in `documents/page.tsx`).
**Backend:** Approvals already real. Reports already real
(`getInventoryKpis`, volume trends, heatmap). Documents: acknowledgement-
receipt generation still needs wiring.
**Frontend:** Approvals — confirm badge/count and queue views match design
doc (also see the sidebar badge placement decision — both sidebar-adjacent
and header-pill, per this session's earlier "both places" call). Reports —
Excel export coverage per §4.8. Documents — finish the AR-generation TODO;
archive search/filter/preview/print/reprint.

---

### P9 — Organization Portal (Home / Orders / Inventory / Labels / Documents)

**Database:** `party_visible_items` query needs backing (may not need new
tables — check if it's a view over existing `items`/`parties`/RBAC scoping).
**Backend:** Home/Orders/Inventory already real via `lib/portal/
resolve-party-scope.ts`. Labels needs the `party_visible_items` query.
Documents needs signed-URL generation against Supabase Storage.
**Frontend:** Home/Orders/Inventory already wired. Labels — Pre-arrival
Label Form (item selection, quantity, optional supplier lot number, barcode
generation, submission status). Documents — wire download button to the
signed URL once backend exists. Reminder: no separate Notifications tab —
portal pages use the same P1 navbar bell as everywhere else.

---

### P10 — Settings (General / Security) + Profile / Team

**Database:** config table (FIFO override policy, defaults) for General;
security-events/MFA table for Security.
**Backend:** Profile/Team already real. General/Security need actions built
against the new tables above.
**Frontend:** Profile/Team already wired. General/Security — replace the
current placeholder pages once backend lands.

---

### P11 — Billing and Pricing (VMI tab / Trading tab)

**Database:** `vmi_cbm_ledger` (contract dates, daily Beginning/Inbound/
Outbound/Ending/Chargeable CBM, fixed charges) for VMI. Pricing/margin
schema (Cost of Goods, Selling Price, Gross Margin, Margin %) for Trading —
likely extends `pick_list_items` rather than a new top-level table; confirm
in `13`'s design.md before migrating.
**Backend:** full new query/action layer for both tabs — none exists today.
**Frontend:** replace the current 100%-mock `billing-pricing/page.tsx` with
VMI tab (accrual + Timeline + printable/emailable SOA) and Trading tab
(pricing rules per design-doc §4.7), once backend is real. This is the
largest single backend gap in the plan — treat as its own multi-cycle build
via `/implement-feature` against `12` then `13`.

---

### P12 — AI Chathead (floating popup, not a page) — last, gated on all else being done

**Does not start until P1–P11 are fully built and functional.** This is a
deliberate ordering choice, not a technical dependency — the chathead adds
no value until the pages/workflows it would assist with actually exist.

**Database:** only if conversation history must persist — a `chat_messages`
table scoped by user/session. If ephemeral per design intent is acceptable,
skip DB entirely.
**Backend:** API route for the three-persona assistant with scoped tool
calls, per `15-ai-chatbot`'s approved design. Owner: `ai-agent-builder`.
**Frontend:** floating launcher mounted once in the P0 shell (bottom-right,
never overlapping the floor primary CTA), opens an in-place popup/panel.

---

## Execution notes

- Each priority above is a full spec-driven cycle where new schema is
  involved: confirm `tasks.md` is current → `database-builder` →
  `db-migration-verifier` → `backend-builder` → `frontend-builder` →
  `design-system-auditor`. Use `/implement-feature` per owning spec.
- P1 is baked into P0's shell — build it before P2 onward so every
  subsequent page ships with a working notification bell from the start,
  instead of retrofitting later.
- `rbac-rls-reviewer` on every Organization Portal priority (P9) — design-
  doc §3.8 forbids cross-organization data leakage and portal pages are the
  highest-risk surface for it.
- `offline-sync-reviewer` on P3/P5 (the scan flows) once P0's scan shell is
  applied, confirming Tier 2 actions never leak into the offline queue.
- Validate P3 and P5 specifically at 375px and 430px portrait before
  considering either "done" — these are the design doc's hardest gate.

## What this plan does not cover

- Does not re-litigate any `tasks.md` — those remain the source of truth for
  what each feature must do.
- Does not invent pages beyond design-doc §4's Page & Role Map — notifications
  and chatbot are explicitly *not* pages per the scope correction above.
- Pricing/billing numbers, notification content, and chatbot persona
  behavior are feature-spec decisions (`12`, `13`, `14`, `15`) — this plan
  assumes their existing `Approved` requirements/design are followed as-is.

## Standing rule

When a priority ships, update `gantt-mapping.md`'s Implementation Status
column in the same commit — don't let the two documents drift.
