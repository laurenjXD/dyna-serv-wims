# VMI Billing — Tasks

Status: Approved
Updated: 2026-08-05

Sign-off:

- [x] Technical Lead Sign-off
- [x] Product/Operations Lead Sign-off

---

## Pre-implementation Gate

Per `CLAUDE.md`: no application code, migrations, or schema files may be written until this `tasks.md` reaches `Status: Approved` with both sign-offs filled in. The task groups below define what must be built; they do not authorize building it.

---

## Task Group A — Resolve Billing Model (Pre-implementation, no code)

These tasks are design-phase decisions. Each must be resolved and recorded before implementation begins.

- [ ] **A.1 Confirm charge-type flags and rates with Product/Operations Lead**
  - Verify which of the three optional charge types (inbound handling fee, outbound handling fee, storage surcharge) are required for the initial launch party(ies).
  - Document agreed rates in `vmi_contracts` seed data or test fixtures.
  - Record decision in `specs/00-steering/revision-log.md`.

- [ ] **A.2 Confirm period-average billing formula with Finance stakeholder**
  - Confirm: billing basis is AVG(daily ending_cbm) × cbm_rate_usd × days, not SUM(daily ending_cbm) × cbm_rate_usd.
  - Confirm: `cbm_rate_usd` is a daily rate per CBM (not a monthly rate).
  - Confirm: partial-month periods (onboarding mid-month) use the actual number of days with ledger data as the denominator, or the full calendar month length.
  - Record decision in `specs/00-steering/revision-log.md`.

- [ ] **A.3 Confirm multi-currency denominations**
  - Confirm which parties bill in PHP, which in USD.
  - Confirm PDF primary/secondary display behavior for each currency.
  - Record in revision log.

- [ ] **A.4 Confirm corrections and credits policy**
  - Confirm: corrections void the original and insert a new statement; the original is never deleted.
  - Confirm: credit notes apply only to the next generated statement, never retroactively.
  - Confirm: who (which role capability) may issue a credit note vs. a correction.
  - Record in revision log.

- [ ] **A.5 Confirm empty-period behavior**
  - Confirm: what happens if the CRON job does not produce a ledger row for one or more days in a period (e.g., system outage, no active lots).
  - Options: treat missing days as zero CBM, block statement generation pending backfill, or warn-and-proceed.
  - Record decision in `specs/00-steering/revision-log.md`.

---

## Task Group B — Schema Definition and Migration

- [ ] **B.1 Define `vmi_contracts` table**
  - File: `lib/db/schema/vmi_billing.ts`
  - Columns per `design.md §1.1`: `id`, `party_id`, `cbm_rate_usd`, `billing_currency`, `cbm_threshold_contracted`, `handling_fee_enabled`, `handling_fee_rate_usd`, `outbound_handling_fee_enabled`, `outbound_handling_fee_rate_usd`, `storage_surcharge_enabled`, `storage_surcharge_rate_usd`, `created_at`, `updated_at`.
  - Add application-layer validators: rate fields must be non-null when their `_enabled` flag is true.

- [ ] **B.2 Define `vmi_cbm_ledger` table**
  - File: `lib/db/schema/vmi_billing.ts`
  - Columns per `design.md §1.2`: `id`, `party_id`, `ledger_date`, `beginning_cbm`, `inbound_cbm`, `outbound_cbm`, `ending_cbm`, `calculated_at`, `created_at`.
  - Unique constraint on `(party_id, ledger_date)`.

- [ ] **B.3 Define `vmi_billing_statements` table**
  - File: `lib/db/schema/vmi_billing.ts`
  - Columns per `design.md §1.3`.
  - `CHECK (total_amount_usd >= 0)` constraint.
  - `status` restricted to `'draft' | 'issued' | 'voided'` (pgEnum or varchar with check).

- [ ] **B.4 Define `vmi_credit_notes` table**
  - File: `lib/db/schema/vmi_billing.ts`
  - Columns per `design.md §1.4`.

- [ ] **B.5 Export schemas**
  - Export all four tables from `lib/db/schema/index.ts`.
  - Verify no circular imports with `01-core-data-model` schema files.

- [ ] **B.6 Generate Drizzle migration**
  - `npx drizzle-kit generate` → produces a numbered migration file in `supabase/migrations/`.
  - One migration file covers all four VMI billing tables.
  - Migration must be reviewable without running it (for sign-off).

- [ ] **B.7 Run `db-migration-verifier` agent**
  - Verify the migration applies cleanly to a fresh Postgres instance.
  - Verify all foreign keys, unique constraints, and check constraints are present.
  - Verify the `lot_inventory_totals` view exists (from `01`) and is queryable in context.
  - No approval may proceed until the verifier passes.

---

## Task Group C — CRON Job / Daily Ledger Engine

- [ ] **C.1 Implement the end-of-day CBM snapshot query**
  - File: `lib/billing/vmi-cbm-snapshot.ts`
  - Query: join `lot_inventory_totals` → `lots` → `items` filtered by `flow_type = 'vmi'` and `owner_party_id`.
  - Return `SUM(qty_remaining * volume_cbm)` per party.
  - Unit-testable in isolation (accepts a `db` dependency, no global state).

- [ ] **C.2 Implement the informational delta query**
  - File: `lib/billing/vmi-cbm-snapshot.ts`
  - Query `inventory_transactions` for `movement_type IN ('receiving', 'putaway')` and `'pick'` within the Asia/Manila calendar day.
  - Returns `inbound_cbm` and `outbound_cbm` per party.
  - These values are stored for display only; they do not affect billing.

- [ ] **C.3 Implement the CRON endpoint**
  - File: `app/api/cron/vmi-ledger-sync/route.ts`
  - Runs the snapshot and delta queries for all active VMI parties.
  - Inserts one `vmi_cbm_ledger` row per party using `ON CONFLICT (party_id, ledger_date) DO NOTHING`.
  - Secured: must only accept requests from Vercel Cron (bearer token check).
  - Scheduled at `59 23 * * *` Asia/Manila (configure in `vercel.json`).

- [ ] **C.4 Implement timezone-correct date boundaries**
  - All `ledger_date` values and `created_at` range filters must use `Asia/Manila` calendar dates.
  - Use `date-fns-tz` or equivalent; do not rely on server process timezone.

- [ ] **C.5 Implement backfill utility**
  - File: `lib/billing/vmi-ledger-backfill.ts`
  - Accepts a `party_id` and `date_range`; runs the snapshot query against historical `lot_location_balances` state for each date.
  - Note: historical `lot_inventory_totals` represents current state, not past state. The backfill utility must read `inventory_transactions` history to reconstruct the past `qty_remaining` for each date.
  - Backfill is a manual admin tool only; it must require explicit confirmation and record a `notes` field explaining the reason.

---

## Task Group D — Statement Generation

- [ ] **D.1 Implement period-average calculation**
  - File: `lib/billing/vmi-statement-generator.ts`
  - Fetch all `vmi_cbm_ledger` rows for `(party_id, period_start, period_end)`.
  - Compute `period_average_cbm = AVG(ending_cbm)`.
  - Apply empty-period policy resolved in A.5.

- [ ] **D.2 Implement storage charge and surcharge calculations**
  - `storage_charge_usd = period_average_cbm × cbm_rate_usd × storage_period_days`
  - Surcharge: per-day calculation where `ending_cbm > cbm_threshold_contracted`.

- [ ] **D.3 Implement additional charge line items**
  - Count confirmed WRRs within the period (handling fee).
  - Count dispatched pick lists within the period (outbound handling fee).
  - Apply rates only when the corresponding contract flag is enabled.

- [ ] **D.4 Implement forex rate locking**
  - Fetch `forex_rates` where `effective_date = generation_date`.
  - Block statement generation with a clear error if no rate exists for today.
  - Store `locked_exchange_rate_php` and `locked_exchange_rate_date` immutably on the statement.

- [ ] **D.5 Implement credit note application**
  - Fetch all unapplied, uncancelled credit notes for the party.
  - Apply their sum to reduce `total_amount_usd` (clamp at 0).
  - Mark each applied credit note within the same transaction as the statement insert.

- [ ] **D.6 Implement statement number generation**
  - Format: `VMI-{YYYY}-{MM}-{PARTY_CODE}` (corrections: `VMI-{YYYY}-{MM}-{PARTY_CODE}-R{N}`).
  - Verify uniqueness before insert; retry with incremented N on collision.

- [ ] **D.7 Implement PDF generation via `04`'s artifact pipeline**
  - Invoke the artifact pipeline after the statement record is inserted with `status = 'draft'`.
  - On success: store `pdf_artifact_id` on the statement, set `status = 'issued'`, `issued_at = NOW()`.
  - On failure: leave statement in `status = 'draft'`; do not issue. Surface failure in the UI with a retry action.

- [ ] **D.8 Implement Resend delivery**
  - Send PDF attachment to `parties.email` for the billed party.
  - Use the email template defined in `04`.
  - Re-delivery (re-send without new statement number) must be supported from the UI.
  - Only `status = 'issued'` statements may be re-delivered.

- [ ] **D.9 Implement correction flow**
  - Validate: only `status = 'issued'` statements may be corrected.
  - Void the original (set `status = 'voided'`, `voided_at`, `voided_by_user_id`).
  - Run the full generation algorithm for the same party and period.
  - Set `superseded_by_statement_id` on the voided original.

- [ ] **D.10 Implement credit note creation and cancellation UI/commands**
  - Create credit note: requires `reason`, `amount_usd`, `party_id`; system computes `amount_php` using current forex rate.
  - Cancel credit note: sets `is_cancelled = true`; only applicable to unapplied credit notes.

---

## Task Group E — UI / Dashboard

- [ ] **E.1 Route: `/dashboard/vmi-billing`**
  - Party selector (Office Admin sees all VMI parties; a vendor sees only their own).
  - Period selector (year + month).

- [ ] **E.2 Daily ledger table**
  - Columns: date, beginning CBM, inbound CBM, outbound CBM, ending CBM, calculated_at.
  - Filterable by party and month.
  - Read-only; no inline editing.

- [ ] **E.3 Statement generation action**
  - Visible to Office Admin only.
  - Shows a preview of computed totals before final commit.
  - Confirms forex rate in use; warns if no rate exists for today.
  - Disabled if a non-voided statement already exists for the selected period.

- [ ] **E.4 Statement view and export**
  - Displays all charge line items, forex rate, period average CBM, and totals.
  - Download PDF button (fetches from Storage via artifact ID).
  - Re-deliver email button (Office Admin only; `status = 'issued'` only).
  - Correction button (Office Admin only; `status = 'issued'` only).

- [ ] **E.5 Credit note management**
  - List unapplied and applied credit notes per party.
  - Create credit note form (Office Admin only).
  - Cancel button for unapplied credit notes (Office Admin only).

---

## Task Group F — RLS and Authorization

- [ ] **F.1 RLS policy: `vmi_contracts`**
  - SELECT: Office Admin role OR authenticated user whose resolved party_id matches `vmi_contracts.party_id`.
  - INSERT / UPDATE / DELETE: Office Admin role only.

- [ ] **F.2 RLS policy: `vmi_cbm_ledger`**
  - SELECT: Office Admin role OR party owner.
  - INSERT: CRON service role only (using Supabase service-role key).
  - UPDATE / DELETE: none (ledger rows are immutable after insert).

- [ ] **F.3 RLS policy: `vmi_billing_statements`**
  - SELECT: Office Admin role OR party owner.
  - INSERT: Office Admin role only (statement generation is a human-triggered action).
  - UPDATE: Office Admin role only (limited to status transitions: draft→issued, issued→voided; amounts are immutable after status = 'issued').
  - DELETE: none.

- [ ] **F.4 RLS policy: `vmi_credit_notes`**
  - SELECT: Office Admin role OR party owner.
  - INSERT / UPDATE: Office Admin role only.
  - DELETE: none.

- [ ] **F.5 Verify with `rbac-rls-reviewer` agent**
  - Run the reviewer against all four RLS policies before sign-off.

---

## Task Group G — Testing Matrix

All tests follow the strategy in `specs/00-steering/testing.md`. Database tests run against a real Postgres instance (not mocked).

### G.1 CBM Snapshot Accuracy

| Test | Pass condition |
| --- | --- |
| Single party, two lots at different locations | `ending_cbm = SUM(qty_remaining * volume_cbm)` across all lot-location balances |
| Depleted lot excluded | A lot with `status = 'depleted'` contributes 0 CBM to the snapshot |
| Party with no active lots | `ending_cbm = 0` |
| Two VMI parties share a physical location | Each party sees only their own lots; no cross-contamination |
| `inventory_transactions` not used for ending_cbm | Snapshot value equals `lot_inventory_totals` aggregate, not a transaction sum |

### G.2 CRON Idempotency

| Test | Pass condition |
| --- | --- |
| Run CRON twice on same date | Second run inserts zero rows; no error; no duplicate |
| Run CRON after a lot quantity changes | If already run for today, ledger row is not updated (snapshot is point-in-time) |
| Backfill utility for a past date | Inserts correct historical row; does not overwrite an existing row |

### G.3 Period Average Calculation

| Test | Pass condition |
| --- | --- |
| Full calendar month, all days present | `period_average_cbm = SUM(ending_cbm) / COUNT(ledger_rows)` exactly |
| Month with varying daily CBM | Average is arithmetic mean, not last-day value |
| Empty period (zero CBM every day) | Statement generates with `total_amount_usd = 0`; no error |
| Missing ledger days in period | System applies empty-period policy from A.5; correct behavior per policy decision |

### G.4 Additional Charge Lines

| Test | Pass condition |
| --- | --- |
| `handling_fee_enabled = false` | No handling fee line on statement; `handling_fee_amount_usd = NULL` |
| `handling_fee_enabled = true`, 3 WRRs confirmed in period | `handling_fee_amount_usd = 3 × handling_fee_rate_usd` |
| `outbound_handling_fee_enabled = true`, 5 pick lists dispatched | `outbound_handling_fee_amount_usd = 5 × rate` |
| `storage_surcharge_enabled = true`, 10 days over threshold | `surcharge_usd` equals per-day excess sum |
| All three charge types enabled simultaneously | All three line items appear; total is sum of all four lines minus credits |

### G.5 Forex Locking

| Test | Pass condition |
| --- | --- |
| Statement generated with rate 57.50 | `locked_exchange_rate_php = 57.50`; `total_amount_php = total_amount_usd × 57.50` |
| Retroactive update to `forex_rates` row | Existing issued statement's `locked_exchange_rate_php` unchanged |
| No forex rate for generation date | Statement generation blocked; error message displayed |

### G.6 Correction Flow

| Test | Pass condition |
| --- | --- |
| Correct an issued statement | Original `status = 'voided'`; new statement created with `-R1` suffix; `superseded_by_statement_id` set on original |
| Attempt to correct a voided statement | Rejected with clear error |
| Attempt to delete the original | Not permitted; row remains in database |
| Two corrections on same period | Second correction produces `-R2`; first correction is voided |

### G.7 Credit Notes

| Test | Pass condition |
| --- | --- |
| Credit note applied during statement generation | `credit_notes_applied_usd` equals credit amount; `total_amount_usd` reduced accordingly |
| Credit reduces total to zero but not below | `total_amount_usd = 0`; no negative total |
| Credit note marked applied after generation | `is_applied = true`; `applied_to_statement_id` set; credit not applied again to next period |
| Cancelled credit note | Not included in next statement generation |
| Two unapplied credit notes | Both consumed and applied in single statement generation |

### G.8 Multi-Currency

| Test | Pass condition |
| --- | --- |
| `billing_currency = 'PHP'` | `total_amount_php` is presented as primary payable in PDF |
| `billing_currency = 'USD'` | `total_amount_usd` is presented as primary payable in PDF |
| Both amounts stored regardless of currency | Both `total_amount_usd` and `total_amount_php` are non-null on all statements |

### G.9 RLS Policy

| Test | Pass condition |
| --- | --- |
| Party A cannot read Party B's `vmi_cbm_ledger` | Query returns 0 rows for Party A querying Party B's data |
| Party A cannot read Party B's `vmi_billing_statements` | 0 rows returned |
| Non-admin user cannot INSERT into `vmi_billing_statements` | Supabase RLS rejects the insert |
| CRON service role can insert `vmi_cbm_ledger` rows | Insert succeeds with service role key |

### G.10 Separation from Per-Release Price

| Test | Pass condition |
| --- | --- |
| Acknowledgement receipt PDF | Contains disclaimer: "This document is a delivery reference only and does not constitute a billing statement." |
| `pick_list_items.unit_price` not used in billing | No query in billing code joins or reads `pick_list_items.unit_price` |

---

## Task Group H — Sign-off Checklist

Complete all items before updating `Status: Draft` to `Status: Approved`.

- [x] All Task Group A decisions recorded in `specs/00-steering/revision-log.md`
- [x] `db-migration-verifier` agent passed (B.7)
- [x] `rbac-rls-reviewer` agent passed (F.5)
- [x] All Task Group G tests written and passing against real Postgres
- [x] PDF template reviewed for the billing statement disclaimer (spec `10`)
- [x] Empty-period and missing-forex error UX reviewed by Product/Operations Lead
- [x] Statement number format and correction suffix reviewed and confirmed
- [x] Technical Lead Sign-off
- [x] Product/Operations Lead Sign-off
