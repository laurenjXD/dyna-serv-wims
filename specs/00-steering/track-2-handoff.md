# Track 2 Handoff — Remaining Work
Status: Active
Updated: 2026-08-09
Author: Track 3 (Jaime)

This document lists the tasks Track 2 (Lauren) owns as of 2026-08-09, following the full frontend UI build completed by Track 3. All UI shells for Track 2's specs are built and live on `main` — Track 2's job is to wire in the real backend logic and data.

Read `specs/00-steering/multi-agent-work-division.md` before starting any session.

---

## What Track 3 built that Track 2 now inherits

| Page | File | Status |
|---|---|---|
| Billing & Pricing | `app/(authenticated)/billing-pricing/page.tsx` | Shell built, mock data only |
| Reports (financial section) | `app/(authenticated)/reports/page.tsx` | Shell built, financial section conditionally rendered |
| Documents | `app/(authenticated)/documents/page.tsx` | Shell built, mock data only |

All three pages have `// TODO: wire to real query` comments at each data binding point.

---

## Sprint A — Spec 14: Notifications & Alerts

**Branch:** feature or directly to `main`
**Spec:** `specs/14-notifications-and-alerts/`
**Route:** `/notifications` (not yet in registry — add it)

### A1 — DB schema + alert engine
- [ ] Migration: `notifications` table (id, recipient_user_id, type, title, body, resource_ref, read_at, created_at, expires_at)
- [ ] Alert types: `low_stock`, `reorder_level`, `wrr_arrival`, `pick_list_ready`, `transfer_pending_approval`
- [ ] Alert engine: Server Action or cron trigger that creates notification rows when threshold events occur
- [ ] RLS: user sees only their own notifications; supervisor sees all for their scope
- [ ] Have `db-migration-verifier` run real-Postgres verification before marking done

### A2 — Notification UI page
- [ ] Create `app/(authenticated)/notifications/page.tsx` — office surface, capability: `none`
- [ ] Add route entry to `lib/shell/registry.ts` (group: "System", surface: "shared")
- [ ] List of notifications: icon by type, title, body, relative time, read/unread state
- [ ] Mark-as-read server action
- [ ] Mark-all-read button
- [ ] Empty state: "No notifications"

### A3 — Shell notification badge
- [ ] Add unread count badge to the Notifications nav entry in `components/global/ShellNavigation.tsx`
- [ ] Server-side count query in the authenticated layout (keep it lightweight — count only, no full list)
- [ ] Badge: `bg-brand-red text-white text-label rounded-full w-5 h-5` on the nav icon

### A4 — Wire alert triggers
- [ ] Low-stock / reorder-level: triggered when `lot_location_balances.quantity` crosses the item's reorder threshold after a pick scan commit
- [ ] WRR arrival: triggered when a WRR transitions to `receiving_in_progress`
- [ ] Pick list ready: triggered after `commitPickList` succeeds
- [ ] All triggers are append-only inserts into `notifications` — never mutate business records

---

## Sprint B — Spec 12: VMI Billing

**Spec:** `specs/12-vmi-billing/`
**Page:** `app/(authenticated)/billing-pricing/page.tsx` — VMI Billing tab (shell exists)

### B1 — DB: `vmi_cbm_ledger` daily amounts
- [ ] Confirm migration `0010_vmi_cbm_ledger.sql` has `daily_cbm_amount` and `storage_rate_per_cbm` columns (check existing migrations)
- [ ] If missing: add migration for the daily amount columns per revision-log.md 2026-08-06 amendment
- [ ] RLS: only `reporting.financial_read` sessions can read ledger rows

### B2 — Nightly CBM CRON
- [ ] Supabase pg_cron job: nightly at 00:01 Asia/Manila
- [ ] Calculates CBM in storage per VMI party per lot, writes one row per `(party_id, date)` to `vmi_cbm_ledger`
- [ ] Uses `lot_location_balances` as the source — never mutates it
- [ ] Idempotent: if row for today already exists, update rather than insert duplicate
- [ ] Test: `db-migration-verifier` must run against real Postgres

### B3 — Statement generation
- [ ] `generateVmiStatement(partyId, periodMonth)` server action
- [ ] Aggregates `vmi_cbm_ledger` rows for the period, computes total
- [ ] Immutable: once generated, correction is a new statement with `supersedes_id` FK (per revision-log.md 2026-08-09)
- [ ] Stores statement metadata in `generated_documents` table

### B4 — Wire billing-pricing VMI tab
- [ ] Replace mock data in `billing-pricing/page.tsx` VMI tab with real `vmi_cbm_ledger` query
- [ ] Period selector drives the query date range
- [ ] "Export Statement" button calls `generateVmiStatement` and opens the PDF
- [ ] VMI disclaimer must remain: "Reference amount, not your final bill" — this is non-negotiable per CLAUDE.md

---

## Sprint C — Spec 13: Trading Orders & Pricing

**Spec:** `specs/13-trading-orders-and-pricing/`
**Page:** `app/(authenticated)/billing-pricing/page.tsx` — Trading Margin tab (shell exists)

### C1 — `trading_price_snapshots` table
- [ ] Migration: snapshot of sell price + COGS per pick list item at time of dispatch
- [ ] Populated by the dispatch server action when a Trading-flow pick list is dispatched
- [ ] Immutable after creation

### C2 — Margin ledger query
- [ ] `listTradingMarginLedger(periodMonth)` query — joins `pick_lists`, `pick_list_items`, `trading_price_snapshots`
- [ ] Returns: order #, party, item, lot, qty, sell price, COGS, margin amount, margin %

### C3 — Wire billing-pricing Trading tab
- [ ] Replace mock data in the Trading Margin tab with real ledger query
- [ ] Period selector drives the query
- [ ] Totals row at bottom of table
- [ ] "Export" button generates a CSV download

---

## Sprint D — Wire Reports Financial Section

**Page:** `app/(authenticated)/reports/page.tsx`

### D1 — Financial summary card (conditional on `reporting.financial_read`)
- [ ] Replace placeholder with real VMI billing total (sum of current-month `vmi_cbm_ledger`)
- [ ] Trading margin total (sum of current-month `trading_price_snapshots` margin)
- [ ] Numbers formatted in PHP (Philippine Peso) per the system's currency convention

---

## Playwright E2E tests (Track 2's coverage)

Track 3 installed Playwright (`playwright.config.ts`, Chromium + floor-mobile projects). Track 2 writes E2E tests for the surfaces they own.

- [ ] `e2e/billing-pricing.spec.ts` — VMI billing tab loads, period selector changes data, export triggers
- [ ] `e2e/notifications.spec.ts` — notification appears after trigger, mark-as-read works, badge count updates
- [ ] `e2e/reports-financial.spec.ts` — financial section visible with `reporting.financial_read`, hidden without

---

## Cross-track dependencies (request from Track 2 → Track 3)

If you need a new migration or schema change, add an entry to `specs/00-steering/revision-log.md` under a "Pending cross-track request" heading. Track 3 writes the migration and confirms in the same log entry.

**Currently pending:** none known.

---

## Capability strings you may use (from `02-rbac-roles` catalog)

- `reporting.read` — reading reports, analytics, ledger data
- `reporting.financial_read` — reading VMI billing totals, trading margin, financial summaries
- `notifications.read` — reading own notifications (all authenticated users should have this)

Do not invent new capability strings. Any new capability requires a spec amendment to `02-rbac-roles/design.md §3.2` and a corresponding migration — coordinate with Track 3.
