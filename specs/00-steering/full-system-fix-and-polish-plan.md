# Full-System Fix and Polish Implementation Plan

**Status:** Pre-UAT implementation and verification in progress — core role, mobile, enrollment, portal, receiving, billing, redirect, export, analytics, dashboard, RBAC, disposable integration, and pool-pressure checks completed; remaining release gates are documented below  
**Date:** 2026-10-27  
**Baseline:** `ddc3c96` on `ml4`, including the merged `origin/v1` changes

## 1. Objective

Bring the whole Dyna-Serv WIMS application to a release-ready state by verifying and correcting:

- data integrity and cross-page connections;
- persistence, authorization, auditability, and document generation;
- every input, validation path, pending state, success state, and error state;
- responsive and floor-scanner usability;
- test reliability, lint quality, and production-build confidence.

This document is an execution plan, not feature approval. Application code must not be written until the owning feature has approved `requirements.md`, `design.md`, and `tasks.md` with both required sign-offs.

The deferred dispatch-scheduling and delivery-tracking feature (`19-dispatch-scheduling-and-delivery-tracking`) remains out of scope.

## 2. Audit baseline

The repository currently has a useful automated baseline, but it does not yet prove full-system correctness:

| Check | Result | Meaning |
|---|---:|---|
| Typecheck | Passed | Type-level baseline is currently healthy. |
| Unit/component tests | 2,170 passed across 193 files | Broad coverage exists; report export, modal data-flow, dashboard-state, custom-report honesty, and the read-only RBAC reference are covered. |
| Public Playwright smoke tests | 8 passed | Login and invite flows are covered only. |
| Production build | Passed | The application compiles successfully. |
| Lint | 0 errors, 166 warnings | Error gate is clear; remaining warnings are outside the touched polish slice. |
| Database integration tests | 4 files / 23 tests passed | Fresh disposable PostgreSQL run completed against the current migration directory; the container was removed afterward. |
| Authenticated visual/page sweep | Passed for the covered role/page matrix | Administrator, Supervisor, floor staff, and party contact checks completed on desktop/mobile routes; remaining physical scanner/offline work is not reproducible in this environment. |

Remaining known gaps include the pending custom-role specification approval and implementation, the legacy location-registry reconciliation pending the zone/location-contract approval gate, portal labels pending their explicit dependency gate, persistent logistics-rate storage/real delivery ledger integration, full mutation/RLS permutations for approvals/enrollment/settings, and physical scanner/offline UAT. The reports heatmap, live custom-builder preview, truthful CSV/XLSX export, SOA historical list, canonical read-only SOA status display, portal notifications, portal recent alerts, portal inventory filter state, SOA empty appendix states, dashboard unavailable-state propagation, non-synthetic dashboard flow/OTIF/heatmap handling, missing-FX protection, canonical RBE schema, settings schema, and compliance schema have been addressed in the current execution slice.

## 2.1 Execution update — 2026-10-26

- Confirmed `ml4` already contains the v1 merge (`ddc3c96`); refreshed `origin/v1` and found no pending merge.
- Added the report custom-builder preview contract. Live VMI billing rows populate the vendor dimension; unsupported metrics/dimensions show `—` or an explicit empty state instead of fabricated values.
- Corrected raw ledger exports so CSV is escaped CSV and XLSX is a real workbook with the correct MIME type and filename; added regression tests.
- Replaced hard-coded party notification rows and portal landing alerts with the authenticated, user-scoped notification query. Mark-all-read now uses the existing RLS-bound action with pending/error feedback.
- Made report archive download/share/preview actions require a real artifact URL and changed unconnected template export/scheduling paths to truthful unavailable feedback.
- Removed unused SOA demo schedule data and added explicit no-source-row states for supporting appendices.
- Verification after the slice: typecheck passed, full unit suite passed (192 files / 2,169 tests), production build passed, `git diff --check` passed, and integration tests remained safely skipped because no disposable `TEST_DATABASE_URL` was configured.
- Removed dashboard query-level zero/demo fallbacks: failed KPI, flow, occupancy, delivery, and master-inventory queries now surface as unavailable to the dashboard instead of looking like valid empty data; flow/OTIF charts no longer fabricate months, the heatmap uses the rolling 31-day window, and empty charts have explicit no-data states.
- Removed the SOA detail page’s hardcoded FX baseline fallback. It now uses the period’s locked rate, then a recorded daily/prior rate, and withholds the statement when neither exists.
- Verification after the dashboard/billing slice: typecheck passed, full unit suite passed (192 files / 2,169 tests), production build passed, `git diff --check` passed, lint remained at 0 errors with repository warnings, and integration tests remain safely skipped because no disposable `TEST_DATABASE_URL` is configured.
- Public Playwright smoke suite completed successfully: 8 tests passed across desktop Chromium and the floor-mobile project. The in-app browser surface reported no connected browser, and authenticated route coverage could not be run without a session and database-backed test fixture.
- Polish pass completed: removed stale warnings from the touched dashboard/report/SOA files, connected the existing VMI invoice-preview callback and report-template scheduler callback to visible actions, and replaced the empty trading-margin default percentage with a truthful `—` state. Scheduling remains explicitly unavailable until its report-job contract is implemented.
- Final verification after polish: typecheck passed, 2,169 unit/component tests passed across 192 files, lint passed with 0 errors and 168 remaining repository warnings, production build passed, `git diff --check` passed, public Playwright passed all 8 tests, and integration tests safely skipped all 21 tests because no disposable `TEST_DATABASE_URL` is configured.
- Existing-data read-only verification completed: the runtime database exposed 14 parties, 552 items, 691 lots, 691 lot-location balances, and 691 inventory transactions; cross-table reference/quantity checks returned zero violations; and all 18 live dashboard/home query checks passed. No seed, reset, insert, update, or delete operation was performed.
- Authenticated QA is now running with the supplied development Administrator account. Read-only browser checks reproduced a React hook-order failure on server-redirect alias routes and dashboard query pressure during cold loads; both are being addressed without changing business data.
- Replaced browser-facing legacy alias `redirect()` pages with a small client route handoff. This keeps `/inspection`, `/transfers`, `/dashboard`, `/billing`, and `/master-data/*` bookmarks working while avoiding the Next 15/React 19 route-transition hook-order failure reproduced in the browser.
- Supabase pooler handling now routes local development session-pooler URLs through transaction mode as well, preventing page-by-page QA from consuming the limited session-client quota. Dashboard reads are split into bounded batches so the shell and dashboard do not compete for every available pooled connection at once.
- Runtime data remains read-only: 14 parties, 552 items, 691 lots, 691 lot-location balances, and 691 inventory transactions; integrity checks and all 18 dashboard/home query checks remain clean. The runtime has no commercial `contracts` table, so the billing configuration page uses its existing VMI/party fallback rather than inventing a migration or table.
- Production-mode spot check passed for the `/inspection` legacy alias (`/inspection` → `/inventory?tab=inspection`) with no browser page errors. The production `/billing-pricing/contracts` path remained slow enough to exceed the short browser timeout during the final spot check; it is not being called release-ready until that configuration query path receives a dedicated performance pass.
- Authenticated role checks completed with the supplied development accounts: Administrator, Supervisor, warehouse floor staff, and party contact sign in successfully; the read-only role catalog matches the approved permission model, including financial visibility for Supervisor and Administrator and party-scoped portal grants for the party contact.
- Clean production-browser checks completed for Administrator desktop enrollment tabs (Organizations, Material, Locations), Supervisor dashboard/receiving/approvals/reports/billing, floor-mobile dashboard/receiving/inventory/outgoing/inspection handoff, and party-mobile portal home/inventory/orders/documents/notifications/labels. Checked pages reported no uncaught browser errors and no horizontal overflow. Rapid navigation produced only expected aborted prefetch requests.
- The isolated receiving query for the floor default (`receiving_in_progress`) completes in about 1.1 seconds with the current data set; an earlier cumulative-load mobile run timed out at the page timeout, but the same route passed after a clean production restart. Keep the timeout/pool behavior on the UAT watch list rather than treating the isolated query as a data defect.
- Unauthorized-route checks are truthful: the party contact receives explicit permission states for `/enrollment`, `/billing-pricing`, `/settings/team`, and `/migration` without data exposure or browser errors.
- Rebuilt production verification found the runtime database is missing the approved `party_rbe_classifications` table. Party organization export now returns a clear HTTP 503 explaining that the canonical enrollment migration must be applied; items and locations exports remain the normal read-only CSV paths. This migration must be applied and the party export re-tested before UAT sign-off.
- Final verification on the rebuilt source passed: 2,170 tests across 193 files, typecheck, production build, `git diff --check`, and all 18 live dashboard/home query checks. Lint remains at 0 errors with 166 repository warnings. The disposable Postgres integration tier passed all 4 files / 21 tests; no live Supabase data was mutated during QA.
- New RBAC finding from the Dynamic Role Creator review: `saveDynamicRole` currently persists only role metadata and an audit row; it does not persist the matrix toggles into `role_permissions`, while `createPageResolver` authorizes from `role_permissions`. The invite form/schema exposes only the four approved system roles, so a newly created custom role cannot be selected for a new user. Runtime custom-role state is also process-local and is lost on restart. This screenshot surface is not release-ready as functional dynamic RBAC; it conflicts with the approved v1 decision that administrators assign protected system roles without redefining capabilities. Either remove/disable the misleading custom-role controls or update and approve the RBAC specification before implementing persisted custom roles and assignment.
- Resolved the RBAC finding within the approved v1 contract: the settings surface is now an accessible, read-only capability reference for approved system roles; unsupported Add Role/Save Matrix/Delete controls are removed; `listRoles` filters to the canonical system-role catalog; and the server actions fail closed if directly invoked for unsupported custom-role writes. New users continue through the validated system-role invite flow. Browser verification of the rebuilt `/settings/team` modal passed with no page errors, 40 disabled capability checkboxes, no Add Role control, and no Save Role Matrix control.
- Started an explicitly disposable Docker Postgres 16 database and ran the real integration tier after aligning stale location fixtures with the current `storage`/`rcv`/`hold` zone contract: all 4 files and all 21 tests passed, including receiving commits, outbound reservation/dispatch/expiry, transaction claim isolation, and transaction-bound Drizzle/RLS enforcement. The disposable container is not a production data source.

## 2.2 Execution update — 2026-10-27 continuation

- Re-ran the fresh disposable PostgreSQL integration tier after the RBAC
  reference fix: 4 files and 21 tests passed. The test container was removed;
  no live Supabase data was written.
- Re-ran the current unit/component suite: 193 files and 2,170 tests passed.
  The jsdom navigation message remains a non-failing test-console warning.
- Re-ran typecheck and quiet lint: both passed. The full lint baseline remains
  0 errors and 166 warnings. `git diff --check` passed.
- Drafted the requested custom-role amendment in RBAC requirements, design,
  tasks, and the revision log. The three RBAC documents are now
  `Pending Reapproval`; no custom-role migration or application code is
  authorized until Product Owner, technical/RBAC, and second-approver
  sign-offs are recorded.
- The approved-v1 settings behavior remains deliberately read-only: protected
  system roles are assignable, but capability definitions cannot be changed.
  Custom-role mutation UAT is therefore a post-approval release gate rather
  than a claim of current coverage.

## 2.3 Execution update — 2026-10-27 runtime blocker pass

- Applied and verified the approved additive runtime schema fixes for canonical
  RBE classifications, system settings, compliance applications/fees, and the
  optional billing-frequency type. Existing party-role rows were preserved;
  the runtime currently has zero RBE classifications, so no legacy RBE data
  was lost.
- Reconciled the runtime Supabase migration history for schema effects already
  present in the database. Duplicate migration prefixes in the repository were
  normalized with unique ordered filenames so future migration checks can
  identify them deterministically. `supabase db push --dry-run` now stops at
  the intentional location-data migrations instead of the earlier history
  drift.
- Added two real-Postgres RLS integration scenarios: approval request/reviewer
  boundaries and administrator-versus-supervisor enrollment/settings writes.
  The disposable tier now passes 4 files / 23 tests.
- The live location registry remains intentionally unchanged. It contains
  referenced legacy transposed rack rows and 80 unused FS rows; the existing
  location rewrite guard refused the conversion without deleting or moving
  operational references. The location migrations remain pending until the
  current zone/location contract is approved and a source-backed conversion is
  verified on a disposable copy.
- Final local checks for this pass: typecheck passed, quiet lint passed, and
  2,170 unit/component tests passed. The only test output warning is jsdom's
  known non-failing navigation message.

## 3. Execution rules

Every finding follows the same RED → GREEN → VERIFY cycle:

1. Confirm the owning spec and identify the exact data contract, permission, audit, and UI behavior.
2. If the contract is missing or ambiguous, update the feature specification and obtain both sign-offs; do not implement against an unapproved task.
3. Test writer adds a failing unit, integration, RLS, or Playwright test at the appropriate layer.
4. Builder implements the smallest production change that makes the test pass.
5. Reviewers verify database/RLS, RBAC, UI-system, integration, and build concerns as applicable.
6. Run the relevant page flow and regression suite.
7. Update `specs/00-steering/gantt-mapping.md` and `revision-log.md` when a work cycle starts or finishes.

No broad automatic rewrite or lint autofix should be applied without reviewing each changed file. Existing user changes must be preserved.

## 4. Priority sequence

### P0 — Establish a trustworthy verification gate

Owner: cross-cutting test/release track.

1. Create a disposable Postgres test environment and document its connection variables. Integration tests must never target a developer, staging, or production database because the current suite drops schemas and truncates data.
2. Add a stable authenticated Playwright fixture using seeded, non-production accounts for Administrator, Supervisor, Storekeeper, and party-portal roles.
3. Keep the lint error gate at zero and reduce warnings in touched files. The current baseline is 0 errors and 168 warnings; the remaining warnings are tracked as broader cleanup rather than hidden by new disables.
4. Repair test doubles that currently throw missing Drizzle-chain methods such as `.groupBy()` while the query catches the error and returns a passing result. Query mocks must model the chain they claim to test, or the test must become a real database integration test.
5. Remove request-scope noise from tests such as `cookies was called outside a request scope`; use explicit session fixtures/mocks rather than relying on caught framework exceptions.
6. Add a defect log convention: route, role, reproduction data, expected result, observed result, data source, permission, severity, owner, test, and disposition.

Exit criteria: lint has zero errors; integration tests run against a disposable database; authenticated browser tests can reach protected pages; false-green query tests are corrected.

### P1 — Restore reporting and document data integrity

Owners: reporting/document feature tracks, with shared RBAC and database review.

#### 4.1 Define the reporting contract

Create one typed report query contract covering date range, horizon, warehouse scope, party scope, flow, financial visibility, metrics, dimensions, and requested output format. Every report card and chart must declare its source query and empty/unavailable behavior.

Do not show synthetic or hardcoded production-looking numbers. If no data exists, render a truthful empty state; if the query fails, render an unavailable state with correlation logging.

#### 4.2 Repair the reports hub

- Connect horizon, custom start date, custom end date, search, metric, dimension, and chart controls to the actual query state.
- Replace the empty custom-builder dataset with live, permission-aware preview data.
- Make month selection reload the heatmap rather than only changing a local label.
- Make custom report generation persist the generated document and audit event, then refresh the archive.
- Implement real archive download, share, and schedule behavior only where the approved task contract supports it. Otherwise disable the control with an explicit “not available” state rather than a success toast.
- Make CSV output CSV and either implement true XLSX generation or remove the XLSX option until its approved task is complete.
- Preserve final displayed prices and financial visibility rules from the approved reporting and document specs.

#### 4.3 Verify document lifecycle

For generated reports, WRRs, pick lists, acknowledgement receipts, SOAs, and supporting schedules, verify:

- immutable artifact metadata and source-record references;
- authorization before preview, download, reprint, or share;
- audit event creation;
- permanent tiered retention behavior for `audit_log`, `lot_history_export`, and `generated_documents`;
- correct filename, MIME type, and file contents.

Exit criteria: every visible report value has a live source or an explicit empty/unavailable state; generated reports appear in the archive; exports have truthful formats; document actions are functional or transparently unavailable.

### P1 — Make SOA and billing state real

Owners: `12-vmi-consignment`, `13-billing-pricing`, `04-data-retention-and-audit`, and the approved billing/document tasks.

1. Replace the hardcoded SOA historical-period list with a server query and pass the result into the directory.
2. Implement status changes through an authorized server action with validation, idempotency, audit logging, and RLS coverage. Refresh both the directory and detail page after success.
3. Verify that SOA totals, charge lines, supporting schedules, contract/address data, balance, payment status, and document references use the same underlying records.
4. Add tests for draft/final/void or equivalent approved statuses, unauthorized updates, stale updates, empty history, failed generation, and reprint/download behavior.
5. Confirm that trading prices are final on the document and VMI prices are per-release references, according to the steering decisions.

Exit criteria: SOA history and status are database-backed; every displayed amount reconciles to supporting data; unauthorized or stale mutations fail safely and visibly.

### P2 — Connect portal and notification behavior

Owners: `14-notifications`, `22-party-portal`, `18-barcode-labels`, and shared RBAC/schema owners.

1. Use the approved notification infrastructure for portal alerts and the shell notification surface. Replace hardcoded portal alerts and mock notifications with scoped queries.
2. Implement mark-read and dismiss behavior with authorization, audit expectations, optimistic/pending/error states, and reload behavior.
3. Keep portal labels behind the approved dependency gate. When its tasks are approved, implement party-visible item queries, scoped RLS, validated label generation, barcode artifact storage, and real download/print behavior. Do not ship the current disabled mock form as if it were functional.
4. Verify portal inventory filter options against the full permitted option set, preserve the active selection, and avoid deriving options only from an already filtered result.
5. Verify portal document links use authorized signed URLs or the approved document action rather than presentation-only links.

Exit criteria: portal home, notifications, inventory, labels, and documents all reflect the same party-scoped source data and expose honest action states.

### P2 — Remove analytics and dashboard masking

Owners: `16-reporting-and-analytics`, dashboard owners, and database/RLS reviewers.

1. Replace static distribution-cost rows, synthetic storage-profitability scores, and demo “stars and dogs” fallback rows with real queries or explicit no-data states.
2. Add conformance tests for every analytics query: date boundaries, empty data, partial data, role visibility, and reconciliation to source records.
3. Audit dashboard fallback handling. A timeout or query error must not silently become a valid-looking zero or empty chart. Show an unavailable state and log a correlation identifier.
4. Verify all dashboard cards and charts against the same operational records used by receiving, inventory, pick lists, withdrawals, billing, and reporting.

Exit criteria: no production route renders demo numbers; empty, stale, and failed states are distinguishable; dashboard and report totals reconcile.

### P3 — Page-by-page functional and input pass

Use the following matrix as the required route inventory. Each row must be tested with at least Administrator, the relevant operational role, and an unauthorized role where applicable.

| Area | Primary routes | Data/input checks | Required verification |
|---|---|---|---|
| Public/auth | `/login`, `/accept-invite` | Validation, loading, bad credentials/token, expiry, redirect, keyboard flow | Existing E2E plus error/expiry cases |
| Dashboard | `/` | Card/chart source, date/filter controls, refresh, unavailable state | Query integration and authenticated Playwright |
| Receiving | `/receiving`, `/receiving/new`, `/receiving/[wrrId]/receive` | WRR creation, scan/Enter behavior, quantities, lot/expiry/price, duplicate scans, save/submit | Receiving integration, RLS, floor-mobile Playwright |
| Inventory | `/inventory`, item/location/lot details | Search/filter, stock adjustments, lot history, inspection/transfer links, stale data | DB integration and mobile/desktop UI |
| Picking/dispatch | `/pick-lists`, pick-list details, dispatch actions | Generation, approval, two-stage commitment, barcode/scan, acknowledgement receipt | Workflow integration and role matrix |
| Outgoing | `/outgoing`, receipt/detail pages | Withdrawal selection, final trading price, receipt upload/remove, rejection/retry | Storage/action tests and UI flow |
| Approvals | `/approvals` | Correct queue, badge counts, approve/reject/reason, authorization | RLS/RBAC and refresh tests |
| Master data | `/enrollment`, `/master-data/*` canonical pages | Create/edit/deactivate parties, items, locations, validation, unique constraints, redirects | Form tests plus database constraints |
| Inspection/transfers | Canonical inspection and transfer pages | Initiation surface, status transitions, quantities, destination, audit trail | Workflow/RLS tests |
| Billing/SOA | `/billing-pricing/*`, `/billing-pricing/soa`, `/billing-pricing/soa/[id]` | Pricing inputs, period selection, status, totals, supporting schedules, export/reprint | Billing integration and document verification |
| Documents | `/documents` | Filters, preview, download, reprint, archive metadata, authorization | Artifact tests and browser download checks |
| Reports | `/reports` | All filters, charts, custom builder, preview, export, archive, schedule/share states | Report query conformance and Playwright |
| Party portal | `/portal`, `/portal/inventory`, `/portal/notifications`, `/portal/labels` | Party scoping, alert state, read/dismiss, filters, label actions, document access | Portal role/RLS integration and browser fixture |
| Profile/settings | `/profile`, `/settings/*` | Profile updates, password/session behavior, user/role management, notification preferences | Authorization, validation, audit, responsive UI |
| Migration/admin | `/migration` | Admin gate, input validation, dry-run/error reporting, audit | Restricted-role test only |

For every input in this matrix, verify: label and accessible name; allowed range/format; required/optional behavior; client and server validation; disabled/pending state; success feedback; failure feedback; persistence; reload behavior; authorization; audit impact; and mobile keyboard/focus behavior where relevant.

### P3 — Responsive, accessibility, and visual polish

Run a focused UI pass at desktop, 375px floor-mobile, and 430px mobile widths.

- Check overflow, clipped tables, sticky headers, dialogs, bottom actions, and print/export layouts.
- Check keyboard navigation, focus visibility, labels, error association, contrast, touch targets, and scanner-friendly Enter handling.
- Standardize loading, empty, unavailable, error, success, and destructive-confirmation states.
- Verify no toast claims success before the server action completes.
- Verify filters and pagination retain state without showing stale rows.
- Capture before/after screenshots for every changed route and review them with the design-system auditor.

### P4 — Release verification and physical QA

Run the complete gate against a disposable database and seeded test accounts:

```text
npm run typecheck
npm run lint
npm test
npm run test:integration
npx playwright test
npm run build
```

Then perform the physical floor workflow: receiving with scanner/keyboard, lot/expiry entry, inventory lookup, pick-list scan, dispatch/acknowledgement, receipt/POD upload, and offline/reconnect behavior. Record device, browser, viewport, role, fixture data, and result.

## 5. Cross-feature ownership and dependency order

| Work | Owning area | Dependencies |
|---|---|---|
| Test environment, fixtures, lint, false-green mocks | Cross-cutting | None; first workstream |
| Report queries, custom builder, archive, exports | `16`, document artifact owners | `01`, `02`, `04`; approved report/document tasks |
| SOA status/history and reconciliation | `12`, `13`, `04` | Canonical billing and document contracts |
| Notifications and portal alerts | `14`, `22` | Shared notification schema and party scoping |
| Portal labels | `22`, `18` | Approved label requirements, barcode/storage contracts, RLS |
| Dashboard/analytics integrity | `05`, `16` | Canonical operational queries |
| Receiving/inventory/outgoing/picking polish | `07`, `08`, `09`, `10`, `11`, `17`, `21` | Existing approved workflow contracts |
| Settings/profile/admin | `02`, `03`, `05` | RBAC and audit contracts |

When a dependency is not approved, update its specification first and stop implementation for that slice until approval is recorded.

## 6. Definition of done

A page or feature is complete only when all of the following are true:

- Every displayed business value has a traceable, authorized source record.
- No user-visible production path relies on mock, demo, static, or synthetic data unless it is explicitly labeled sample data.
- Every input is validated on the server and client as appropriate, persists correctly, and reloads correctly.
- Success, pending, empty, unavailable, and error states are distinct and truthful.
- RLS, RBAC, audit, idempotency, and retention behavior are tested where relevant.
- Desktop and floor-mobile layouts are usable, including scanner/keyboard workflows.
- Unit, integration, and end-to-end tests cover the changed behavior.
- Typecheck, lint, full test suite, disposable-database integration suite, Playwright, and production build pass.
- The owning spec, task status, Gantt mapping, revision log, and defect record are current.

## 7. Recommended delivery slices

1. **Verification foundation:** P0 and release-fixture setup.
2. **Data integrity:** reports, documents, billing/SOA, analytics, and dashboard fallbacks.
3. **Operational workflows:** receiving, inventory, picking, outgoing, approvals, inspections, transfers, and master data.
4. **Portal and settings:** notifications, party portal, labels when approved, profile, and settings.
5. **UI polish and physical QA:** responsive/accessibility pass, browser sweep, floor workflow, and final release gate.

The audit should be re-run after each slice. A slice is not complete because its page renders; it is complete only when its inputs, persistence, permissions, source data, failure behavior, and regression tests all pass.
