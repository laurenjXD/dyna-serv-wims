# Reporting & Analytics — Tasks

Status: Approved
Updated: 2026-08-06

Sign-off:

- [x] Technical Lead Sign-off
- [x] Product/Operations Lead Sign-off

---

## Implementation Gate

**This feature may not enter implementation until:**

1. `01-core-data-model` tasks.md is `Status: Approved` with both sign-offs — the `lot_inventory_totals` view, `inventory_transactions` ledger, `lots`, `items`, `pick_lists`, `wrr_documents`, and `wrr_inspection_logs` schemas must be final. Its canonical `lot_history_export` read model refreshes daily and retains three years; `16` owns generation and serving.
2. `02-rbac-roles` tasks.md is `Status: Approved` — the `reporting.read`, `reporting.export`, and `reporting.party_read` capabilities must be seeded, the `party_visible_items` view must exist, and RLS helpers must be verified.
3. `05-ui-shell-and-navigation` tasks.md is `Status: Approved` — the authenticated shell, sidebar navigation, and protected route groups must exist before dashboard pages can be mounted.
4. This tasks.md has both required sign-offs filled in.
5. `01`'s `master_inventory_tracking`/`lot_history_export` contracts and `02`'s `reporting.financial_read` capability must be approved before implementation.

Dependency on spec `09` (approval_requests table) is partial: the FIFO override count metric (FR-4.3) is gated on `09`'s approval. All other analytics work is independent. The UI displays a "pending spec 09 approval" placeholder for that metric until `09` is approved.

Dependency on spec `04` (scheduled infrastructure) is partial: the `daily_transaction_counts` materialized view refresh job requires `04`'s cron infrastructure. The heatmap uses a direct fallback query until that job is available.

---

## Dependencies

| Spec | Required before | Why |
| --- | --- | --- |
| `01-core-data-model` | All tasks | Canonical tables, `lot_inventory_totals` view |
| `02-rbac-roles` | Task 16.6 | `reporting.party_read` capability, RLS helpers, `party_visible_items` view |
| `04-services-and-infrastructure` | Task 16.7 (partial) | Scheduled job for `daily_transaction_counts` refresh |
| `05-ui-shell-and-navigation` | Task 16.3 | Authenticated shell, sidebar, route groups |
| `09-approval-queue` | Task 16.4 (partial) | `approval_requests` table for FIFO override count |
| `11-transfer-and-inspection` | Task 16.4 (partial) | Post-pick inspection analytics (FR-7.2 full coverage) |

---

## Task 16.1 — Analytics Taxonomy and Component Inventory

**Goal:** Lock the analytics domain taxonomy, component list, and metric-to-table mapping before any code is written. This task is specification and design confirmation only — no code.

**Steps:**

1. Confirm the six analytics domains (Inventory, Receiving, Outbound, VMI, Trading, Operational) map cleanly onto the approved canonical tables. Document any gaps where a required metric cannot be sourced from an approved table.
2. Confirm the ten reusable component names (`<KpiCard>`, `<KpiCardGroup>`, `<ActivityHeatmap>`, `<TrendLineChart>`, `<BarChart>`, `<DonutChart>`, `<StockLevelTable>`, `<AlertBanner>`, `<RecentActivityFeed>`, `<FlowPartitionSummary>`) are not already defined elsewhere in the codebase under different names.
3. Confirm the `reporting.party_read` capability has been added to the canonical capability catalog in `02-rbac-roles/design.md` §3.2 and is present in the `role_permissions` seed migration.
4. Confirm `lot_inventory_totals` is available as a queryable view in the approved `01` migrations before Task 16.2 begins.
5. Confirm the `daily_transaction_counts` materialized view DDL (defined in `design.md` §2.1) is compatible with `REFRESH MATERIALIZED VIEW CONCURRENTLY` — requires a unique index on `(activity_date, flow_type, movement_type)`.

**Decision table:**

| Question | Decision |
| --- | --- |
| Does the `lot_inventory_totals` view exist in the approved `01` migrations? | If yes: proceed. If no: block Task 16.2 until `01` delivers it. |
| Is `reporting.party_read` in the `02` capability catalog? | If yes: proceed. If no: block Task 16.6 until `02` adds it. |
| Does `daily_transaction_counts` support `CONCURRENTLY` refresh? | Confirm unique index is present in the DDL. If missing: add it before Task 16.7. |
| Are any of the ten component names already in use? | If a naming conflict exists: resolve via the revision log before Task 16.3 begins. |

**Completion criteria:** All five confirmation steps documented; no open blockers; decision table rows all resolved.

---

## Task 16.2 — Data Access and Query Architecture

**Goal:** Define and verify all analytics query functions in `lib/analytics/queries/`. No UI code yet.

**Steps:**

1. Create `lib/analytics/queries/inventory.ts` — queries for KPI cards (Total Lots In Stock, Total Committed Qty, Low Stock Items Count), stock level summary, stock aging, lot status distribution, flow partition view, and FIFO/FEFO queue health. All aggregate queries target `lot_inventory_totals`, never raw `lot_location_balances`.
2. Create `lib/analytics/queries/receiving.ts` — queries for WRR volume trend, discrepancy rate, inspection outcome breakdown, cycle time, and top received items.
3. Create `lib/analytics/queries/outbound.ts` — queries for pick list volume trend, commitment duration, FIFO override count (placeholder until spec `09` is approved), dispatch rate, and top dispatched items.
4. Create `lib/analytics/queries/heatmap.ts` — heatmap query with `daily_transaction_counts` primary path and direct `inventory_transactions` fallback path. Flow type filter parameterized as `'vmi' | 'trading' | 'supplies' | 'all'`.
5. Create `lib/analytics/queries/export.ts` — paginated keyset-cursor export queries for Inventory Snapshot, Transaction Ledger, Receiving History, and Dispatch History. Each query accepts a `lastSeenId` cursor parameter and returns a maximum of 1000 rows.
6. Write the `daily_transaction_counts` materialized view migration (one concern per file, sequentially numbered after `01`'s final migration).
7. Write the proposed index migrations from `design.md` §7.1 (one migration file covering all analytics-specific indexes).
8. Run real-Postgres integration tests (see §8.2 in `design.md`) against the query functions. Verify:
   - `lot_inventory_totals` is used as the scan source for all aggregate queries (check `EXPLAIN` output).
   - Party user sessions return only their own party's rows.
   - `buying_price`, `selling_price`, and `default_supplier_party_id` are absent from party-user query results.
   - `daily_transaction_counts` refresh succeeds concurrently.
9. Run `db-migration-verifier` against the new migration files.

**Completion criteria:** All query files exist and are typed; all integration tests pass; `db-migration-verifier` reports no failures; no raw `lot_location_balances` aggregate in any query plan.

---

## Task 16.3 — Reusable Component Library

**Goal:** Build all ten reusable dashboard components per `design.md` §4. Components must be embeddable by other features.

**Steps:**

1. Create `components/analytics/KpiCard.tsx` — props interface per `design.md` §4.1; `data-display` typography for value; `label` typography for label; trend arrow + color + text (never color alone); `aria-label` in the format `"{label}: {value}, {direction} {pct}% from prior period"`.
2. Create `components/analytics/KpiCardGroup.tsx` — responsive CSS grid wrapper; `grid-cols-1` → `md:grid-cols-2` → `lg:grid-cols-3`.
3. Create `components/analytics/ActivityHeatmap.tsx` — 52-col × 7-row CSS Grid; five `brand-navy` opacity tiers (not arbitrary Tailwind blue shades); legend strip with text labels alongside each swatch; keyboard navigation with `role="grid"` and `role="gridcell"`; tooltip on hover/focus showing date and count in `body-sm` + `mono`; flow filter tabs.
4. Create `components/analytics/TrendLineChart.tsx` — `brand-royal-blue` line on `surface-white`; Roboto Mono x-axis labels; Epilogue y-axis labels; `role="img"` with `aria-label`; hidden `role="table"` for screen reader data.
5. Create `components/analytics/BarChart.tsx` — categorical bars; status color tokens for status-partitioned breakdowns; value label on every bar; `role="img"` + hidden data table.
6. Create `components/analytics/DonutChart.tsx` — uses canonical `lot_status` tokens (`status-available`, `status-pending`, `status-held`, `status-neutral`, `brand-royal-blue` at 50% opacity for `expired`); legend with text label + count + percentage; center value display; `role="img"` + hidden data table.
7. Create `components/analytics/StockLevelTable.tsx` — Epilogue SemiBold uppercase headers; Outfit body; Roboto Mono for quantities and codes; `radius-full` status badges with text; `aria-sort` on sortable headers; expiry-imminent warning icon; horizontal scroll container at `md`/base.
8. Create `components/analytics/AlertBanner.tsx` — severity icon + message + CTA link; `status-pending` / `status-held` color paired with icon; keyboard-focusable link.
9. Create `components/analytics/RecentActivityFeed.tsx` — movement type badges; `mono` for codes and quantities; `body-sm` timestamp.
10. Create `components/analytics/FlowPartitionSummary.tsx` — three equal panels at `lg`, stacked at `md`/base; Supplies panel hidden for `party_user` callers; flow accent colors per `design.md` §4.10.
11. Export all ten from `components/analytics/index.ts`.
12. Write component tests per `design.md` §8.3 for all ten components.

**Completion criteria:** All ten components exist, exported, and pass component tests; all components use brand design tokens (no inline hex values); `<ActivityHeatmap>` passes keyboard navigation tests; `<DonutChart>` and all charts pass the no-color-alone requirement check.

---

## Task 16.4 — Dashboard Views

**Goal:** Build the six analytics domain pages and the main dashboard, wired to the query functions from Task 16.2 and the components from Task 16.3.

**Steps:**

1. Build `/reports` — the main analytics dashboard (renamed from `/dashboard` 2026-08-07 — see `specs/00-steering/revision-log.md`; the app's general landing page is `/`, owned by `05-ui-shell-and-navigation`). Parallel RSC architecture per `design.md` §7.2: `KpiDataLoader`, `HeatmapDataLoader`, `QuickAccessLoader`, `RecentActivityLoader`. Each section wrapped in `<Suspense>` with a skeleton placeholder.
2. Build `/reports/inventory` — Stock Level Summary (`<StockLevelTable>`), Stock Aging Report, Lot Status Distribution (`<DonutChart>`), Low Stock Report, FIFO/FEFO Queue Health, Flow Partition View (`<FlowPartitionSummary>`).
3. Build `/reports/receiving` — WRR Volume Trend (`<TrendLineChart>`), Discrepancy Rate KPI, Inspection Outcome Breakdown (`<BarChart>`), Average Receiving Cycle Time KPI, Top Received Items table.
4. Build `/reports/outbound` — Pick List Volume Trend (`<TrendLineChart>`), Commitment Duration, FIFO Override Frequency (shows placeholder if spec `09` is not yet approved), Dispatch Rate, Top Dispatched Items table.
5. Build `/reports/vmi` — Occupied CBM Over Time (`<TrendLineChart>`), Stock on Hand by Party (`<BarChart>`), Lot Activity Summary per Party (`<StockLevelTable>`), Billing Period Reference banner.
6. Build `/reports/trading` — Order Activity Trend (`<TrendLineChart>`), Item Movement Velocity table. Margin Reference Display conditionally rendered only for `reporting.read` global scope users and only when `items.selling_price` is non-null.
7. Build `/reports/operational` — Transfer Volume chart, Inspection Case Outcomes (inbound only until spec `11` is approved), Document Generation Success Rate KPIs.
8. Add sidebar navigation entries for all six domain pages, behind `reporting.read` capability check. Party users with `reporting.party_read` see only the Inventory and VMI/Trading pages relevant to their scope.
9. Implement the configurable filter bar (date range, party selector, flow type toggle, item search) at `/reports`. Apply filters to all tabular drill-down views.

**Decision table:**

| Question | Decision |
| --- | --- |
| Should party users see the `/reports/vmi` page? | Yes, scoped to their own party via RLS. The page renders identical markup; data differs by session. |
| Should party users see the `/reports/trading` page? | Yes, scoped to their own party. |
| Should party users see the `/reports/operational` page? | No. Operational analytics is internal warehouse data; route returns 403 for `party_user`. |
| Should the Margin Reference Display be shown to supervisors? | No, unless `reporting.read` global scope is explicitly granted to supervisor role. Default: admin only. |
| What renders for the FIFO Override Frequency card before spec `09` is approved? | An `<AlertBanner severity="warning">` stating "FIFO override data pending spec 09 approval." |

**Completion criteria:** All seven pages render correct data against a seeded dataset; filter bar updates all tabular views; party user routing restrictions are enforced; Suspense skeletons render during loading states.

---

## Task 16.5 — Reports and Export

**Goal:** Build the CSV export endpoints and the Reports UI (date range + filter controls + tabular drill-downs).

**Steps:**

1. Create route handler `app/api/export/inventory-snapshot/route.ts` — requires `reporting.export` capability; paginates `lot_inventory_totals` + `lots` + `items` + `lot_location_balances` in 1000-row keyset chunks; streams CSV response with `Content-Disposition: attachment; filename="inventory-snapshot-{date}.csv"`; excludes `buying_price`, `selling_price`, `default_supplier_party_id` from all responses.
2. Create route handler `app/api/export/transaction-ledger/route.ts` — requires `reporting.export`; paginates `inventory_transactions` with lot, item, party joins; accepts `start_date`, `end_date`, `flow_type` query parameters; keyset cursor pagination.
3. Create route handler `app/api/export/receiving-history/route.ts` — requires `reporting.export`; joins `wrr_documents`, `wrr_items`, `wrr_inspection_logs`; accepts date range and party filters.
4. Create route handler `app/api/export/dispatch-history/route.ts` — requires `reporting.export`; joins `pick_lists`, `pick_list_items`; accepts date range and party filters.
5. All four route handlers: verify the caller's capability on every request (do not rely on middleware alone); scope the result set via the RLS transaction wrapper; validate and sanitize all query parameters; set `Content-Type: text/csv; charset=utf-8`.
6. Add "Export CSV" buttons to each tabular drill-down view in Task 16.4's pages. Buttons are hidden for users without `reporting.export`.
7. Wire the `/reports` filter bar (date range, party, flow type, item) to the tabular drill-down pages. Filter state is managed in URL search params so pages are shareable and bookmarkable.
8. Add Master Inventory bulk grouping/filtering and Connected Lot History Excel export using the canonical lot-history read model.

**Completion criteria:** All four export endpoints return correctly scoped, correctly formatted CSV for both admin and party-user sessions; sensitive columns are absent from party-user exports; a 403 is returned when a user without `reporting.export` calls an export endpoint directly; pagination handles datasets larger than 1000 rows without loading all rows into memory.

---

## Task 16.6 — Authorization, RLS, and Scope Verification

**Goal:** Verify the end-to-end authorization model for all analytics endpoints and confirm no data leaks across party boundaries.

**Steps:**

1. Confirm `reporting.read` (global), `reporting.export` (global), and `reporting.party_read` (assigned_party) are present in the `role_permissions` seed and in the live database.
2. Run the real-Postgres integration tests from `design.md` §8.2 specifically targeting authorization: party user sessions return only their own party's rows for every analytics query; admin sessions return all rows; Supplies flow data is never returned to party users.
3. Run `rbac-rls-reviewer` against all six domain pages and all four export handlers. Confirm no application-layer `WHERE party_id = ?` clause is the sole enforcement mechanism — RLS must be the primary gate.
4. Verify that `items.buying_price`, `items.selling_price`, and `items.default_supplier_party_id` are absent from all party-user analytics responses. Use a test that directly checks the column list of the response, not just that the values happen to be null.
5. Verify that the Supplies panel in `<FlowPartitionSummary>` is hidden for party-user sessions.
6. Verify the Trading analytics Margin Reference Display does not render for party-user sessions.
7. Verify that a party user with `flow_type = 'vmi'` scope cannot access Trading analytics data by manipulating URL parameters.
8. Confirm export route handlers re-verify capability on every request — not relying on the prior page-level capability check.

**Completion criteria:** `rbac-rls-reviewer` reports no findings; all authorization integration tests pass; no cross-party data leak found in any analytics endpoint or export.

---

## Task 16.7 — Performance, Accessibility, and Final Testing

**Goal:** Verify the dashboard meets the 2-second load target, all WCAG AA accessibility requirements, and the full testing matrix.

**Steps:**

1. Seed the test database with at least 10 000 `inventory_transactions` rows, 200 `lots`, 50 `items`, 5 parties, 100 `wrr_documents`, and 100 `pick_lists`. Run a timed load test of `/reports` (renamed from `/dashboard` 2026-08-07) for an Office Admin session. Verify the first meaningful paint (KPI cards visible) occurs within 2 000ms.
2. Confirm `lot_inventory_totals` is used as the aggregate scan source in all inventory KPI query plans. Use `EXPLAIN (ANALYZE, BUFFERS)` to confirm no sequential scan of `lot_location_balances` occurs at the analytics layer.
3. If the dataset exceeds 500 000 rows (load test with synthetic data if needed): confirm the `daily_transaction_counts` materialized view is used by the heatmap query and that `REFRESH MATERIALIZED VIEW CONCURRENTLY` completes without locking reads.
4. Run axe-core against the main dashboard page and all six domain pages. Resolve all WCAG AA violations before sign-off.
5. Verify all ten components pass the no-color-alone requirement: every `<DonutChart>` segment has a text label, every `<KpiCard>` trend arrow has accompanying text, every `<ActivityHeatmap>` tier has a legend label.
6. Verify `<ActivityHeatmap>` keyboard navigation: arrow keys move focus between cells; Enter/Space surfaces the tooltip; `role="grid"` and `role="gridcell"` are present.
7. Run the full Playwright end-to-end test suite from `design.md` §8.4.
8. Run `db-migration-verifier` against all migrations introduced in Tasks 16.2 and 16.5. Confirm clean application in order.
9. Confirm the `daily_transaction_counts` refresh migration and the analytics index migration are present and correctly ordered relative to `01`'s final migration number.

**Decision table:**

| Question | Decision |
| --- | --- |
| Dashboard first paint exceeds 2 000ms on the seeded dataset? | Investigate the slowest query using `EXPLAIN ANALYZE`. If `lot_inventory_totals` scan is slow: confirm the index on `lots(status, flow_type)` is present. If heatmap is slow: confirm `daily_transaction_counts` is being used. |
| An analytics index conflicts with an existing `01` migration index? | Merge the conflicting index into the `01` migrations file; do not duplicate. Log the resolution in `revision-log.md`. |
| axe-core reports a chart accessibility violation? | Fix before sign-off — no WCAG AA violation is deferred post-sign-off. |
| `db-migration-verifier` reports a failure? | Do not sign off until resolved. |

**Completion criteria:** Dashboard loads in under 2 000ms on the seeded dataset; zero axe-core WCAG AA violations; all Playwright E2E tests pass; `db-migration-verifier` reports PASS; no sequential scans of `lot_location_balances` in any analytics query plan.

---

## Testing Matrix

| Area | Method | Owner | Gate |
| --- | --- | --- | --- |
| KPI formula correctness | Vitest unit tests | Task 16.2 | Before Task 16.4 |
| Heatmap color tier mapping | Vitest unit tests | Task 16.3 | Before Task 16.4 |
| Component accessibility (aria, no-color-alone) | Vitest + Testing Library | Task 16.3 | Before Task 16.4 |
| Aggregate queries use `lot_inventory_totals` | Real-Postgres + EXPLAIN | Task 16.2 | Before Task 16.4 |
| Party user data isolation | Real-Postgres integration tests | Task 16.6 | Before sign-off |
| Sensitive field exclusion | Real-Postgres integration tests | Task 16.6 | Before sign-off |
| Export scoping and pagination | Real-Postgres integration tests | Task 16.5 | Before sign-off |
| Authorization (403 for unauthorized) | Playwright E2E | Task 16.6 | Before sign-off |
| Dashboard load time (< 2 000ms) | Timed load test | Task 16.7 | Before sign-off |
| WCAG AA | axe-core + Playwright | Task 16.7 | Before sign-off |
| Full E2E suite | Playwright | Task 16.7 | Before sign-off |
| Migration correctness | `db-migration-verifier` | Tasks 16.2, 16.5 | Before sign-off |
| RLS boundary enforcement | `rbac-rls-reviewer` | Task 16.6 | Before sign-off |

---

## Sign-off Checklist

Before setting `Status: Approved`, both signatories must confirm all items below:

**Corrected 2026-08-08**: every item below was marked `[x]` since this section was first drafted, before any of this spec's actual implementation existed (traced via `git log` to the original spec-drafting commit). That's not evidence of real completion — per this project's own standing rule, a checked box must correspond to an actual verification that happened, not "should be fine." Re-verified each item against the real code on this branch as of today; corrected to match.

- [x] `01-core-data-model` is `Status: Approved` with both sign-offs. (Spec-level fact, genuinely true.)
- [x] `02-rbac-roles` is `Status: Approved` with both sign-offs; `reporting.party_read` and `reporting.financial_read` are in the canonical capability catalog, with financial access granted to Supervisor and Administrator. (Spec-level fact, genuinely true.)
- [x] `05-ui-shell-and-navigation` is `Status: Approved` with both sign-offs. (Spec-level fact, genuinely true — the actual shell UI code is separate, in-progress Track 1 work, not this criterion.)
- [ ] All ten reusable components are implemented, exported, and pass component tests. **Partially true**: all ten exist in `components/analytics/` and are exported. Not true: only `components/analytics/__tests__/utils.test.ts` exists — no per-component render test for any of the ten.
- [x] No analytics query performs a raw aggregate against `lot_location_balances` — confirmed by query plan review. (Grepped `lib/analytics/queries/*.ts`: no raw aggregate outside `lot_inventory_totals` usage.)
- [x] `daily_transaction_counts` materialized view migration is present and `CONCURRENTLY` refresh is verified. **Real as of 2026-08-08** — `supabase/migrations/0006_daily_transaction_counts.sql`, delivered by Track 1 and independently `db-migration-verifier`-verified (held-open-transaction proof that `CONCURRENTLY` genuinely doesn't block reads).
- [x] All analytics indexes from `design.md` §7.1 are present in migrations and do not conflict with `01`. **Real as of 2026-08-08** — `supabase/migrations/0007_analytics_indexes.sql`, same delivery, `EXPLAIN`-verified planner adoption.
- [ ] Party user data isolation is verified by real-Postgres integration tests for every analytics domain. Not done — no integration test in `lib/analytics/queries/__tests__/` runs against real Postgres or exercises RLS; the two existing test files (`export.test.ts`, `shared.test.ts`) are unit-level.
- [ ] Sensitive fields (`buying_price`, `selling_price`, `default_supplier_party_id`) are absent from all party-user responses — confirmed by column-presence test, not value-check. Not done — no test file references any of these three fields.
- [ ] All four CSV export endpoints are scoped by RLS, re-verify capability on every call, and paginate correctly. Not done — `lib/analytics/csv.ts` (serialization, formula-injection protection) exists, but no route handler wires it to the now-available RLS wrapper; nothing is mounted yet.
- [ ] Dashboard first paint completes in under 2 000ms on a 10 000+ row seeded dataset. Not done — no dashboard page exists yet.
- [ ] Zero WCAG AA violations reported by axe-core on all analytics pages. Not done — no pages exist yet.
- [ ] All Playwright E2E tests pass. Not done — no Playwright suite exists for this spec yet.
- [x] `db-migration-verifier` reports PASS on all migrations introduced by this spec. True for the migration files themselves (`0006`/`0007`, verified as noted above) — does not cover the query-function-to-migration integration, which is the still-open item above.
- [ ] `rbac-rls-reviewer` reports no findings on analytics pages and export handlers. Not done — no pages or export handlers exist yet to review.
- [x] `stock_entries` does not appear anywhere in this feature's code or queries. (Grepped `lib/`, `components/`, `app/` — zero matches.)
