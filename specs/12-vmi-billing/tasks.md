# VMI Billing — Tasks

Status: Approved
Updated: 2026-08-19

Sign-off:

- [x] Technical Lead Sign-off — Name: User / System (auto-sign-off per standing instruction) Date: 2026-08-19
- [x] Product/Operations Lead Sign-off — Name: User / System (auto-sign-off per standing instruction) Date: 2026-08-19

---

## Pre-implementation Gate

Per `CLAUDE.md`: no application code, migrations, or schema files may be written until this `tasks.md` reaches `Status: Approved` with both sign-offs filled in. The task groups below define what must be built; they do not authorize building it.

This is a full rewrite of a previously-`Approved` spec — see `requirements.md`'s header for what's superseded. Nothing from the prior `vmi_contracts`/`vmi_cbm_ledger`/`vmi_billing_statements`/`vmi_credit_notes` schema carries forward; if any of those tables were ever migrated in a prior session, Task Group B includes dropping them.

---

## Task Group A — Resolve Billing Model (Pre-implementation, no code)

All of the following were resolved in conversation, cross-checked against real source files (`Draft billing.pdf`, `CBM MONTH OF JUNE R1.xlsx`, `PR260026P_Phil whse (07-01).xls`), and are recorded here rather than left open like the prior version of this document.

- [x] **A.1 Charge-type coverage** — Resolved: Warehousing and Handling are always movement-replay aggregates, never per-shipment entries. Documentation defaults from contract but is per-line overridable. Delivery is always a manual per-shipment entry (no contract rate). Four recurring fee types are evidenced (LOA, surety bond, trucking admin fee, manpower), modeled as an open list (`vmi_recurring_fee_lines`), not a fixed pair of booleans. Record in `specs/00-steering/revision-log.md` alongside this rewrite.
- [x] **A.2 Storage formula and timing** — Resolved: `storage_charge_usd = SUM(vmi_daily_balance_ledger.storage_amount_usd)` over the period (never `average_cbm × rate × days`). `billing_timing` (`beginning_of_day` | `end_of_day`) is per-party configurable; the evidenced real contract bills off beginning-of-day. Verified exactly against June 1 (`792.02 × 0.05 = $39.60`) and the period total (`$1,116.90`).
- [x] **A.3 Multi-currency** — Resolved: `billing_currency` stays per-party (`USD` | `PHP`); `locked_exchange_rate_php`/`locked_exchange_rate_date` captured at period-close time from `forex_rates`, immutable after.
- [x] **A.4 Corrections and credits policy** — Resolved: a correction voids the original `vmi_billing_periods` row and issues a new one with a `-R{n}` suffix; the original is never deleted or edited in place. Credits (`vmi_payments` with `type IN ('credit_memo','adjustment')`) apply only to the period they're recorded against, consumed atomically at close.
- [x] **A.5 Empty-period and missing-data behavior** — Resolved: a day with no `vmi_daily_balance_ledger` row (CRON outage, no active lots) is an exception state surfaced to the Administrator at period-close preview, not silently treated as zero CBM. An empty period (zero CBM every day, rows present) is valid and generates with `$0` storage charge.
- [x] **A.6 SOA opening balance / AR carryover** — Resolved: `vmi_billing_periods.soa_opening_balance_usd` for period N = period N-1's `soa_closing_balance_usd` for that party (0 for a party's first period). A genuine running AR balance, not a per-period-isolated figure.
- [x] **A.7 Payment recording** — Resolved: `vmi_payments` are entered manually by an Administrator against one specific `vmi_billing_periods` row. Partial payments permitted. No external payment-feed import in this build.
- [x] **A.8 Letter of Authority cadence** — Resolved: regenerated at every period close alongside the other three documents, sharing the same period number/revision, even though `vmi_permits` content rarely changes month to month.
- [x] **A.9 `vmi_contract_terms` rate versioning** — Resolved (2026-08-19): `vmi_contract_terms` is an effective-dated version history (`effective_from`/`effective_to`/`is_active`), the same shape `trading_policies` already uses, not a single mutable row per party. This was identified during design review as a real gap: a "read the contract fresh" approach (originally drafted for Handling, §2.3) is not point-in-time-safe against mid-period rate changes, and even a "snapshot nightly" approach alone doesn't correctly handle *backfilling* a day after a later rate change, since there'd be nowhere to look up what the rate actually was on the backfilled date. Versioning the contract table fixes both: the nightly job and the backfill utility (C.6) both resolve "the rate in effect" by date against this history. Storage was already effectively safe going forward (nightly snapshot into `vmi_daily_balance_ledger`); Handling was not, and is corrected in this rewrite (§2.3). Record in `specs/00-steering/revision-log.md` alongside this rewrite.

---

## Task Group B — Schema Definition and Migration

- [x] **B.0 Drop prior VMI billing tables, if present** — Confirmed 2026-08-19: no `vmi_contracts`/`vmi_cbm_ledger`/`vmi_billing_statements`/`vmi_credit_notes` exist anywhere in `lib/db/schema/` or the migrations folder — clean slate, no-op.
- [x] **B.1 Define `vmi_contract_terms`** — File: `lib/db/schema/vmi_billing.ts`. Columns per `design.md` §1.1, including `vmi_billing_timing` and `vmi_cbm_threshold_type` enums, and the version-history fields (`is_active`, `effective_from`, `effective_to`, `created_by_user_id`). Application-layer invariant: at most one row per `party_id` with `effective_to IS NULL`, enforced the same way as `trading_policies`' "one active row per key" invariant in `13`. Real-Postgres verified 2026-08-19: no DB-level unique constraint on `party_id` alone (confirmed by successfully inserting two open-ended rows for the same party — the invariant is intentionally app-layer only, deferred to Task C/D).
- [x] **B.2 Define `vmi_recurring_fee_lines`** — Columns per `design.md` §1.2, including `vmi_recurring_fee_type` enum (`loa` | `surety_bond` | `trucking_admin_fee` | `manpower` | `other`).
- [x] **B.3 Define `vmi_daily_balance_ledger`** — Columns per `design.md` §1.3. Unique constraint on `(party_id, ledger_date)`. Real-Postgres verified: duplicate insert correctly rejected.
- [x] **B.4 Define `vmi_charge_lines`** — Columns per `design.md` §1.4, including `vmi_charge_type` enum. `acknowledgement_receipt_id` FKs to `generated_documents.id` (10's actual schema has no dedicated AR table — corrected 2026-08-19, see design.md §0); real-Postgres verified: valid insert succeeds, bogus-UUID insert correctly rejected. Enum itself contains no `'warehousing'`/`'handling'` values (satisfies the schema-level half of the validator by construction). The second validator — the referenced `generated_documents` row must actually have `document_type = 'acknowledgement_receipt'` — is runtime behavior owned by Task D.2's charge-line command, not this schema task; not yet implemented.
- [x] **B.5 Define `vmi_permits`** — Columns per `design.md` §1.5.
- [x] **B.6 Define `vmi_billing_periods`** — Columns per `design.md` §1.6. `CHECK (billing_statement_total_usd >= 0)`. `status` restricted to `'draft' | 'issued' | 'voided'`. Real-Postgres verified: both checks correctly reject invalid values.
- [x] **B.7 Define `vmi_payments`** — Columns per `design.md` §1.7, including `vmi_payment_type` enum.
- [x] **B.8 Export schemas** — Export all seven tables from `lib/db/schema/index.ts`. Verify no circular imports with `01-core-data-model` or `documents.ts` (`vmi_charge_lines` FKs to `generated_documents`).
- [x] **B.9 Generate Drizzle migration** — `supabase/migrations/0032_vmi_billing_tables.sql` (generated against a scoped throwaway config since this repo's `drizzle-kit` journal has been stale/hand-authored since migration 0004 — see the migration's own file history; SQL verified equivalent to a clean generate).
- [x] **B.10 Run `db-migration-verifier` agent** — **PASS**, 2026-08-19. Verified on fresh disposable Postgres 16, full sequence 0001–0032 applied cleanly twice (independent runs). All FKs, unique constraints, check constraints, and all 6 VMI enum value sets confirmed byte-for-byte against `design.md`. No real bugs found. RLS (Task Group F) explicitly out of scope for this gate — none of the 9 new tables have RLS enabled yet, as expected at this stage.
- [x] **B.12 Define `vmi_manpower_hours_log`** — File: `lib/db/schema/vmi_billing.ts`. Columns per `design.md` §1.2a (added 2026-08-20, surfaced during Task D.4): `recurring_fee_line_id`, `party_id`, `period_start_date`, `period_end_date`, `hours`, `notes`, `recorded_by_user_id`. Unique on `(recurring_fee_line_id, period_start_date, period_end_date)` — re-logging hours for an already-logged period is an edit, not a duplicate row. 75/75 tests passing, full suite 1747/1747. Migration `0038_vmi_manpower_hours_log.sql` written, `db-migration-verifier` pass still pending.
- [x] **B.11 `01-core-data-model` amendment: add `items.vmi_movement_category`** — Surfaced during Task C.1: `design.md` §2.1 assumed a per-movement FG/RAW_MATERIAL/FOR_PROCESS/REJECT/RE_INSPECT classification that had no backing column anywhere in the already-implemented `01` schema. Product Owner decision 2026-08-19: add it as a fixed, nullable property of `items` (new `vmi_movement_category` enum column, not a repurposing of the existing free-text `item_type`), per `specs/01-core-data-model/design.md` §1.1/§1.2's amendment and `specs/00-steering/revision-log.md`. Implemented as `supabase/migrations/0033_items_vmi_movement_category.sql`. **`db-migration-verifier` PASS, 2026-08-19**: full 0001–0033 sequence applies cleanly; enum has exactly the 5 correct values; column nullable and correctly typed; diffed against pre-0033 state confirming no other `items` column touched; valid/invalid/omitted-value inserts all behave correctly.

---

## Task Group C — Daily Balance Replay Engine

- [x] **C.1 Implement the movement-shaping query over `inventory_transactions`** — File: `lib/billing/vmi-movement-query.ts`. Joins `inventory_transactions → lots → items`, filtered by `lots.flow_type = 'vmi'` and `lots.owner_party_id`, resolving `direction` from `movement_type` (`receiving`/`putaway` → IN, `pick` → OUT; `transfer`/`inventory_reconciliation` rows dropped entirely per `design.md` §2.1) and `category` from `items.vmi_movement_category` (nullable, passed through as `null`). 21/21 unit tests passing (accepts a `db` dependency, no live Postgres needed at this tier). Note: this module trusts a caller-supplied `party_id` and performs no authorization itself by design — the actual scope/permission check belongs at the call site (C.4's CRON endpoint, service-role only), to be verified by `rbac-rls-reviewer` when that call site exists, not against this internal function in isolation.
- [x] **C.2 Implement the daily balance replay** — File: `lib/billing/vmi-daily-balance.ts`. Computes `beginning_cbm`, `ending_cbm`, IN/OUT split by category (FG/RAW_MATERIAL), per `design.md` §2.2 steps 1-4. 31/31 unit tests passing.
- [x] **C.3 Implement the storage-charge calculation, both timing modes** — Resolves `billed_balance_cbm` from `contract.billing_timing`, resolves `applied_storage_rate_usd` by looking up the `vmi_contract_terms` version effective on `ledger_date` (`design.md` §2.2 step 6 — not simply "the current row"), applies `cbm_threshold_type` (no-op when `'none'`), computes `storage_amount_usd`. Verified test: `beginning_of_day`, no threshold, `beginning_cbm = 792.02`, `rate = 0.05` → `$39.60` exactly. A.9 backfill-correctness case explicitly tested and passing (a past date resolves the rate that was actually in effect then, not the current/latest contract version).
- [x] **C.4 Implement the nightly job** — Corrected 2026-08-20 (see `design.md` §2.2's invocation-architecture note and `revision-log.md`): NOT a Vercel-Cron-secured `app/api/cron/*` route — `04-services-and-infrastructure` §14.5 locks scheduled work to Supabase Cron/`pg_cron` triggering Supabase Edge Functions. Three pieces:
  - [x] **C.4a** `app/api/internal/vmi-daily-balance/route.ts` — the real logic. Runs C.1-C.3 for all active VMI parties, `ON CONFLICT (party_id, ledger_date) DO NOTHING`. Secured by a shared secret (Vercel env var), rejecting any request missing/mismatching it, compared via `crypto.timingSafeEqual` (constant-time, per `rbac-rls-reviewer` finding — see `revision-log.md`). 8/8 tests passing. `rbac-rls-reviewer` pass: secret comparison PASS; cross-party `db` access documented as a deliberate exception under `04 §8.6`'s routing table — the deeper "no distinct DB-role privilege boundary" gap is accepted as a named follow-up tied to `04`'s pre-existing Finding 7, not a blocker here.
  - [x] **C.4b** `supabase/functions/vmi-daily-balance-trigger/` — thin Deno Edge Function, first in this codebase. Reads the shared secret from Supabase Vault, makes one authenticated call to C.4a, no billing logic of its own. No hardcoded credentials (`db-migration-verifier` confirmed).
  - [x] **C.4c** `supabase/migrations/0034_vmi_daily_balance_cron_schedule.sql` — `cron.schedule(...)` + `pg_net.http_post(...)` invoking C.4b, `59 15 * * *` UTC (= `23:59` Asia/Manila, UTC+8, no DST — arithmetic independently re-verified). **`db-migration-verifier` PASS against real Postgres with real `pg_cron`/`pg_net`/`supabase_vault`** (escalated to `supabase/postgres:15.1.0.117` after a plain Postgres image lacked the extensions) — confirmed idempotent re-application, no hardcoded secrets, vault-secret lookups resolve correctly into a real outbound HTTP call (verified against `httpbin.org`), and `pg_cron` genuinely auto-fires the job on schedule (observed 2 real automatic firings via a temporary same-body clone). One unrelated scope note: unblocking this run required a manual patch to an older `storage.buckets` schema shape in the pinned Postgres image to get past `0030`; `0030` itself was not independently re-verified this session — flagged, not a defect in this task.
- [x] **C.5 Implement timezone-correct date boundaries** — All `ledger_date` values and `created_at` range filters use Asia/Manila calendar dates. Implemented as `resolveManilaLedgerDate`/`resolveManilaDayBoundsUtc` in C.4a (`app/api/internal/vmi-daily-balance/route.ts`), reused by C.6's backfill utility for the same date-enumeration/boundary logic.
- [x] **C.6 Implement backfill utility** — File: `lib/billing/vmi-daily-balance-backfill.ts`. Accepts `party_id` + `date_range`; reconstructs historical balances by replaying `inventory_transactions` history (not a `lot_inventory_totals`-style current-state read), resolving the applicable `vmi_contract_terms` version for each backfilled date the same way C.3 does (queries the party's *full* version history, not just the open row — the deliberate divergence from C.4a's nightly query). Manual admin tool: rejects a missing/empty/whitespace-only `notes` field before any DB call; gap-fills only, never overwrites an existing `vmi_daily_balance_ledger` row. 10/10 unit tests passing, including the named A.9 backfill-correctness case (a day backfilled after a later rate change resolves the rate actually in effect then, not today's). Real-Postgres integration testing (per `testing.md`'s two-stage strategy) still open, same as C.4a/C.4b/C.4c's own noted gaps — the mocked tier here is development-speed verification only.

---

## Task Group D — Period Close / Four-Document Generation

- [x] **D.1 Implement handling aggregation** — File: `lib/billing/vmi-handling.ts`. For each `vmi_daily_balance_ledger` row in the period, resolve the `vmi_contract_terms` version effective on that row's `ledger_date` and price that day's IN/OUT CBM against it, then sum across the period — per `design.md` §2.3 (not a flat `total_cbm × current contract rate`; see A.9 for why). Verified against the June fixture (single contract version active all period, so this reduces to the simple form): `157.18 × 1.40 = 220.05`; `262.96 × 1.40 = 368.14`. 8/8 tests passing, including a named mid-period rate-change case. Full project suite now 1685/1685, zero known failures.
- [x] **D.2 Implement charge-line entry commands** — File: `lib/actions/vmi-charge-lines.ts`. Create/edit a `vmi_charge_lines` row (`documentation`, pre-filled from `contract.documentation_default_rate_usd`, editable, `source` stays `'auto'` even when overridden per design.md §2.4; `delivery`, blank, required manual PHP amount, `source='manual'`; ad-hoc types, free entry, `source='manual'`). Rejects edits once the line's period has closed (no covering period ≠ closed). Validates the referenced `generated_documents` row is actually an `acknowledgement_receipt`. Gated `reporting.financial_read`. 34/34 tests passing, full suite 1719/1719, zero failures.
- [x] **D.3 Implement documentation/delivery aggregation** — File: `lib/billing/vmi-charge-aggregation.ts`. Sums `vmi_charge_lines` by type within the period; converts delivery PHP total to USD via the period's locked FX rate; ad-hoc charges sum with per-row currency conversion (defensive — currently always USD in practice, per D.2). Verified: `₱40,896.00 / 61.71 = $662.71` exactly. 18/18 tests passing, full suite 1737/1737, zero failures.
- [ ] **D.4 Implement recurring-fee aggregation** — Sums active `vmi_recurring_fee_lines`, with `manpower` requiring an hours-logged entry for the period, sourced from the new `vmi_manpower_hours_log` table (B.12) — `hours × manpower_rate_per_hour`, converted to USD; `$0`/omitted when no matching row exists for the period (matching the real June statement's treatment, never an error).
- [ ] **D.5 Implement forex rate locking** — Fetch `forex_rates` where `effective_date = generation_date`. Block period close with a clear error if absent. Store immutably on `vmi_billing_periods`.
- [ ] **D.6 Implement SOA running-balance calculation** — `soa_opening_balance_usd` = prior period's `soa_closing_balance_usd` (0 if first period). `soa_payments_applied_usd` = `SUM(vmi_payments WHERE type='payment' AND applied_to_period_id = this period)`. `soa_closing_balance_usd` computed per `design.md` §2.6 step 5.
- [ ] **D.7 Implement period-number generation** — Format `VMI-{YYYY}-{MM}-{PARTY_CODE}` (corrections: `-R{N}`). Verify uniqueness before insert.
- [ ] **D.8 Implement the period-close command** — File: `lib/billing/vmi-period-close.ts`. Runs D.1-D.7, validates no existing non-voided period for the same party/month, computes `billing_statement_total_usd`, inserts `vmi_billing_periods` with `status = 'draft'`.
- [ ] **D.9 Implement four-document PDF generation via `04`'s artifact pipeline** — Billing Statement, Warehousing Charges (unrolled daily from `vmi_daily_balance_ledger`), SOA, Letter of Authority (from the party's active `vmi_permits` row(s)). All four generated from the same close action. On any failure: leave `status = 'draft'`; do not issue; surface a retry action.
- [ ] **D.10 Implement Resend delivery** — Send all four PDFs as attachments to `parties.email`. Re-delivery supported from the UI; only `status = 'issued'` periods may be re-delivered.
- [ ] **D.11 Implement correction flow** — Validate `status = 'issued'`; void original; re-run D.1-D.10 for the same party/month; set `superseded_by_period_id`; regenerate and re-deliver all four documents.
- [ ] **D.12 Implement payment creation** — `vmi_payments` insert: `party_id`, `applied_to_period_id`, `amount_usd`, `type`, `payment_date`, `notes`. Administrator only. Recomputes the target period's `soa_payments_applied_usd`/`soa_closing_balance_usd` if the period is still `draft`; if `issued`, the payment applies to `soa_opening_balance_usd` of the *next* period's close instead (an issued period's own totals never change after the fact).

---

## Task Group E — UI / Dashboard

- [ ] **E.1 Route: `/billing-pricing/vmi`** — Office-only, gated `reporting.financial_read`. Party selector shows all active VMI parties.
- [ ] **E.2 Daily balance ledger table** — Columns per `design.md` §6: `DATE | BEGINNING CBM | IN (FG) | IN (RAW MTL'S) | OUT (FG) | OUT (RAW MTL'S) | ENDING CBM | RATE | AMOUNT`. Filterable by party and month. Read-only.
- [ ] **E.3 Charge-line entry table** — For the current open period: Documentation and Delivery per `acknowledgement_receipt`, plus ad-hoc types. Editable pre-close, locked post-close.
- [ ] **E.4 `vmi_contract_terms`/`vmi_recurring_fee_lines` read-only display + edit sub-route** — `billing-pricing/vmi/contracts/[partyId]/edit`. Saving a rate change closes the current version (`effective_to`) and inserts a new one (design.md §1.1); it never mutates rate values on an existing row in place, and never rewrites already-computed `vmi_daily_balance_ledger` rows or already-closed periods. Shows the version history (past rates with their effective ranges) alongside the edit form.
- [ ] **E.5 `vmi_permits` CRUD sub-route** — `billing-pricing/vmi/permits/[partyId]`.
- [ ] **E.6 Period-close action** — Preview of computed totals (all four documents' content) before commit. Confirms forex rate in use; warns on missing/empty ledger days. Disabled if a non-voided period already exists for the selected month.
- [ ] **E.7 Period view** — `billing-pricing/vmi/periods/[periodId]`. Displays all charge lines, forex rate, SOA opening/closing balance, and links to all four generated PDFs. Re-deliver and Correction actions (Administrator only; `status = 'issued'` only).
- [ ] **E.8 Payment recording UI** — Form: amount, date, type, applied period, notes. Administrator only.

---

## Task Group F — RLS and Authorization

- [ ] **F.1 RLS policy: `vmi_contract_terms`, `vmi_recurring_fee_lines`, `vmi_permits`** — SELECT: Office Admin/Supervisor OR owning party. INSERT/DELETE: Office Admin only. For `vmi_contract_terms` specifically, UPDATE is restricted to closing out `effective_to` on the currently-open version (design.md §4) — a policy-level check, not just an application-layer one, since a rewrite of historical rate values would silently corrupt already-issued billing history.
- [ ] **F.2 RLS policy: `vmi_daily_balance_ledger`** — SELECT: Office Admin/Supervisor OR owning party. INSERT: CRON service role only. No UPDATE/DELETE.
- [ ] **F.3 RLS policy: `vmi_charge_lines`** — SELECT: Office Admin/Supervisor OR owning party. INSERT/UPDATE: Office Admin/Supervisor only, and only while the row's period is not yet closed (application-layer + RLS both enforce).
- [ ] **F.4 RLS policy: `vmi_billing_periods`** — SELECT: Office Admin/Supervisor OR owning party. INSERT/UPDATE (status transitions): Office Admin only.
- [ ] **F.5 RLS policy: `vmi_payments`** — SELECT: Office Admin/Supervisor OR owning party. INSERT: Office Admin only. No UPDATE/DELETE.
- [ ] **F.6 Verify with `rbac-rls-reviewer` agent** — Run against all seven tables' RLS policies before sign-off.

---

## Task Group G — Testing Matrix

All tests follow `specs/00-steering/testing.md`. Database tests run against real Postgres. **The June 2026 fixture data (`Draft billing.pdf`, `CBM MONTH OF JUNE R1.xlsx`) is the canonical regression fixture** — every one of the numbers below is a real, verified figure, not a synthetic example.

### G.1 Daily Balance Replay Accuracy

| Test | Pass condition |
| --- | --- |
| Single party, `beginning_of_day` timing, day 1 (`beginning_cbm = 792.02`, rate `0.05`) | `storage_amount_usd = $39.60` exactly |
| Full June fixture replayed day-by-day | `ending_cbm` after the last day = `686.24` |
| Aggregate check | `first_day_beginning_cbm + total_IN − total_OUT = last_day_ending_cbm` (`792.02 + 157.18 − 262.96 = 686.24`) |
| `end_of_day` timing on the same fixture | Storage amounts differ from `beginning_of_day` on any day with nonzero same-day movement; totals otherwise consistent |
| Two VMI parties share the warehouse | Each sees only their own lots' movements |
| `transfer`/`inventory_reconciliation` movement types | Excluded from IN/OUT entirely, per design.md §2.1 |
| Storage rate changed mid-period (new `vmi_contract_terms` version inserted, old one closed) | Days before the change price at the old rate, days on/after price at the new rate; already-computed `vmi_daily_balance_ledger` rows for past days are untouched by the edit itself |
| Backfill a day after a later rate change | Backfilled day resolves the `vmi_contract_terms` version effective on *its own* date, not the current/latest version — proves the version-history model (A.9), not just "snapshot nightly," is what makes this correct |
| Attempt to insert a second `vmi_contract_terms` row with `effective_to IS NULL` for a party that already has one | Rejected by the application-layer invariant |

### G.2 CRON Idempotency

| Test | Pass condition |
| --- | --- |
| Run CRON twice on same date | Second run inserts zero rows |
| Backfill for a past date | Inserts correct historical row; does not overwrite an existing row |

### G.3 Storage Charge and Threshold

| Test | Pass condition |
| --- | --- |
| `cbm_threshold_type = 'none'` (the evidenced real case) | `storage_amount_usd = billed_balance_cbm × rate` exactly, no threshold logic invoked |
| `cbm_threshold_type = 'minimum_billable'`, balance below threshold | Billed at the threshold floor, not the actual (lower) balance |
| `cbm_threshold_type = 'included_allowance'`, balance above threshold | Within-threshold portion at base rate, excess at `over_threshold_rate` |
| Period sum | `SUM(vmi_daily_balance_ledger.storage_amount_usd) = $1,116.90` for the June fixture |

### G.4 Handling

| Test | Pass condition |
| --- | --- |
| June fixture handling totals | `handling_in_usd = $220.05`, `handling_out_usd = $368.14` exactly |
| Different in/out rates configured | Each direction prices independently |
| Handling rate changed mid-period | Days before the change price at the old handling rate, days on/after at the new rate — the exact regression case this rewrite's A.9 decision exists to cover |
| Handling never appears as a `vmi_charge_lines` row | No query in the handling calculation path reads `vmi_charge_lines` |

### G.5 Documentation and Delivery

| Test | Pass condition |
| --- | --- |
| Documentation line created with no override | Defaults to `contract.documentation_default_rate_usd`, `source = 'auto'` |
| Documentation line overridden to `$0.00` | Stored value used, not the default, matching real fixture rows |
| Delivery line, no contract rate exists at all | Field is always required manual entry; no default ever offered |
| June fixture delivery total | `₱40,896.00 / 61.71 = $662.71` exactly |
| Warehousing charge_type submitted to `vmi_charge_lines` | Rejected by the application-layer validator (design.md §1.4) |

### G.6 Recurring Fees

| Test | Pass condition |
| --- | --- |
| Four fee types active (LOA, surety bond, trucking admin, manpower with 0 hours) | June fixture: `$36.00 + $0.00 + $200.00 + $0.00` contribute correctly; manpower with 0 hours logged contributes `$0` |
| LOA fee linked to a `vmi_permits` row | `flat_amount_usd` mirrors `vmi_permits.monthly_fee_usd` |
| Manpower with hours logged | `hours × rate_per_hour`, converted to USD |

### G.7 Full Statement Assembly

| Test | Pass condition |
| --- | --- |
| Full June fixture, all charge types assembled | `billing_statement_total_usd = $3,023.80` exactly |

### G.8 SOA / Running Balance

| Test | Pass condition |
| --- | --- |
| Party's first period | `soa_opening_balance_usd = 0` |
| Second period, first unpaid | `soa_opening_balance_usd = ` first period's `soa_closing_balance_usd` |
| Partial payment recorded against a draft period | `soa_payments_applied_usd` reduces `soa_closing_balance_usd` accordingly, never below the true remaining balance |
| Payment recorded after a period is already issued | Applies to the *next* period's opening balance, not a retroactive edit of the issued period |

### G.9 Period Close and Corrections

| Test | Pass condition |
| --- | --- |
| Close a period | All four documents generate; status becomes `issued` only after all four succeed |
| One document's PDF generation fails | Status remains `draft`; no partial issuance; retry action available |
| Correct an issued period | Original `status = 'voided'`; new period `-R1`; `superseded_by_period_id` set |
| Attempt to correct a voided period | Rejected |
| Two corrections on the same period | Second produces `-R2` |

### G.10 Forex Locking

| Test | Pass condition |
| --- | --- |
| Period closed with rate `61.71` | `locked_exchange_rate_php = 61.71` stored immutably |
| Retroactive `forex_rates` update | Already-issued period's locked rate unchanged |
| No forex rate for close date | Period close blocked, clear error |

### G.11 RLS Policy

| Test | Pass condition |
| --- | --- |
| Party A cannot read Party B's `vmi_daily_balance_ledger`/`vmi_billing_periods`/`vmi_payments` | 0 rows returned |
| Non-admin cannot INSERT `vmi_billing_periods` | RLS rejects |
| CRON service role can insert `vmi_daily_balance_ledger` | Succeeds |

### G.12 Separation from Per-Release Price

| Test | Pass condition |
| --- | --- |
| Acknowledgement receipt PDF | Still contains the delivery-reference disclaimer |
| `pick_list_items.unit_price` not used anywhere in billing code | No query in `lib/billing/**` joins or reads it |

---

## Task Group H — Sign-off Checklist

Complete all items before updating `Status: Draft` to `Status: Approved`.

- [ ] All Task Group A decisions recorded in `specs/00-steering/revision-log.md`
- [ ] `db-migration-verifier` agent passed (B.10)
- [ ] `rbac-rls-reviewer` agent passed (F.6)
- [ ] All Task Group G tests written and passing against real Postgres, including the full June fixture reproducing `$3,023.80` exactly
- [ ] PDF templates for all four documents reviewed against the real `Draft billing.pdf`/`CBM MONTH OF JUNE` layouts
- [ ] Empty-period, missing-forex, and missing-rate-card error UX reviewed by Product/Operations Lead
- [ ] Period number format and correction suffix reviewed and confirmed
- [ ] Technical Lead Sign-off
- [ ] Product/Operations Lead Sign-off
