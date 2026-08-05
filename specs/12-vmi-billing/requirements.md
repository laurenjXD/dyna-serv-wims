# VMI Billing — Requirements

Status: Draft
Updated: 2026-08-05

Depends on:

- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/01-core-data-model/` (Depends on `lots`, `lot_location_balances`, `lot_inventory_totals`, `items.volume_cbm`, `inventory_transactions`, `forex_rates`, `parties`)
- `specs/02-rbac-roles/`
- `specs/04-services-and-infrastructure/` (PDF artifact pipeline, Resend delivery)
- `specs/10-pick-list-and-acknowledgement-receipt/` (per-release reference price context)

---

## 1. Overview

The VMI Billing module automatically tracks the physical storage space (Cubic Meters, CBM) occupied by a vendor's inventory on a daily basis and generates authoritative monthly billing statements from those daily records.

The authoritative billing basis is the **occupied CBM per party per day**, derived from `lot_inventory_totals.qty_remaining × items.volume_cbm` at end-of-day. This view is itself an aggregation of `lot_location_balances`, which is the canonical physical quantity model in `01-core-data-model`. Raw `inventory_transactions` records are NOT queried directly as the billing source; they are the immutable audit ledger and may be used only as auxiliary inputs for the inbound/outbound delta columns in the daily ledger.

The module supports three charge types in addition to the base storage rate: an inbound handling fee per WRR, an outbound handling fee per pick list, and a storage surcharge when occupied CBM exceeds a contracted threshold. Each charge type is independently enabled per `vmi_contracts`. Billing may be denominated in PHP or USD per contract, with the forex rate locked immutably at statement generation time.

---

## 2. Goals

- Maintain an automated daily ledger (`vmi_cbm_ledger`) that records the end-of-day occupied CBM per VMI vendor, sourced from `lot_inventory_totals`.
- Generate monthly billing statements based on the arithmetic mean of daily ending CBM values (period average), not a cumulative sum.
- Support optional additional charge types (inbound handling, outbound handling, storage surcharge) that are explicitly enabled per contract.
- Lock the USD-to-PHP forex rate at statement generation time; retroactive forex changes must never propagate to issued statements.
- Support statement corrections (void + reissue) and credit notes without negative-stating current-period statements.
- Deliver generated statements as PDFs via `04`'s artifact pipeline, sent to the party contact via Resend.
- Maintain an explicit separation between the per-release reference price on an acknowledgement receipt (`10`) and the authoritative period statement generated here.

---

## 3. Functional Requirements

### FR-1: VMI Contracts

1. The system SHALL maintain a `vmi_contracts` record for every `party` enrolled as a VMI vendor.
2. Each contract SHALL store:
   - `cbm_rate_usd` — daily rate per occupied CBM, expressed in USD.
   - `billing_currency` — the denomination for statement totals: `'PHP'` or `'USD'`.
   - `cbm_threshold_contracted` — optional; the maximum CBM covered by the base rate. If NULL, no surcharge applies regardless of other flags.
3. Each contract SHALL carry three independent boolean flags that enable optional charge types:
   - `handling_fee_enabled` — inbound handling fee, applied once per confirmed WRR.
   - `outbound_handling_fee_enabled` — outbound handling fee, applied once per dispatched pick list.
   - `storage_surcharge_enabled` — surcharge applied when daily ending CBM exceeds `cbm_threshold_contracted`.
4. When a charge-type flag is `false`, the system SHALL NOT generate a line item for that charge type on any statement, regardless of WRR or pick list activity.
5. A party MAY have at most one active `vmi_contracts` record at a time.

### FR-2: The Daily CBM Ledger

1. The system SHALL maintain an automated daily ledger (`vmi_cbm_ledger`) with one row per active VMI vendor per calendar day.
2. The CRON job SHALL run at **23:59 Asia/Manila** time daily.
3. The authoritative `ending_cbm` for a given party on a given date SHALL be computed as:

   ```text
   SUM(lot_inventory_totals.qty_remaining × items.volume_cbm)
   ```

   across all lots where `lots.flow_type = 'vmi'` AND `lots.owner_party_id = <party_id>` AND `lots.status NOT IN ('depleted')`, joined via `lot_inventory_totals` to get the per-lot remaining quantity, then joined to `items` for `volume_cbm`.

4. `beginning_cbm` SHALL be the `ending_cbm` value from the previous calendar day's ledger row for that party. For the very first ledger row of a party, `beginning_cbm` is `0`.
5. `inbound_cbm` and `outbound_cbm` SHALL be populated from `inventory_transactions` filtered to `flow_type = 'vmi'`, `lots.owner_party_id = <party_id>`, and `created_at` within the calendar day (Asia/Manila). These columns are informational only; the `ending_cbm` snapshot is authoritative.
6. The CRON job SHALL be idempotent: if a row for a given `(party_id, ledger_date)` already exists, the job SHALL skip that pair without error.
7. A `calculated_at` timestamp SHALL be stored on every ledger row to record when the snapshot was taken.

### FR-3: Monthly Billing Generation

1. An Office Administrator SHALL trigger `vmi_billing_statement` generation for a selected party and calendar month.
2. The billing period is the full calendar month: from the 1st to the last day of the selected month (inclusive).
3. The **Period Average CBM** SHALL be computed as the arithmetic mean of all `ending_cbm` values in `vmi_cbm_ledger` for that party within the period:

   ```text
   period_average_cbm = AVG(ending_cbm) over all ledger_date rows in [period_start, period_end]
   ```

4. The **Storage Charge** SHALL be computed as:

   ```text
   storage_charge_usd = period_average_cbm × cbm_rate_usd × storage_period_days
   ```

   where `storage_period_days` is the number of calendar days in the billing period.

5. If `storage_surcharge_enabled = true` and `cbm_threshold_contracted` is set, a surcharge line SHALL be computed for each day where `ending_cbm > cbm_threshold_contracted`:

   ```text
   surcharge_usd = SUM((ending_cbm - cbm_threshold_contracted) × surcharge_rate_usd)
                   over days where ending_cbm > cbm_threshold_contracted
   ```

6. The system SHALL fetch the `usd_to_php_rate` from `forex_rates` where `effective_date` equals the statement generation date and **lock** it permanently on the statement. If no forex rate exists for the generation date, the system SHALL block statement generation and prompt the user to enter the rate first.
7. The locked exchange rate SHALL be stored immutably on the statement row. Retroactive changes to the `forex_rates` table SHALL NOT alter any previously generated statement.
8. The total statement amount SHALL be computed and stored in both USD and PHP regardless of `billing_currency`. The `billing_currency` field determines which amount is presented as the primary payable.

### FR-4: Additional Charge Types

1. **Inbound Handling Fee** — when `handling_fee_enabled = true`, the system SHALL count the number of WRR documents confirmed for this party within the billing period and apply `handling_fee_rate_usd` per WRR.
2. **Outbound Handling Fee** — when `outbound_handling_fee_enabled = true`, the system SHALL count the number of pick lists with `status = 'dispatched'` for this party within the billing period and apply `outbound_handling_fee_rate_usd` per pick list.
3. **Storage Surcharge** — when `storage_surcharge_enabled = true` and `cbm_threshold_contracted` is set, the surcharge is applied as defined in FR-3.5.
4. Each charge type SHALL appear as a separate named line item on the generated billing statement. If a charge type is not enabled, that line SHALL be absent from the statement entirely.
5. The final `total_amount_usd` on the statement SHALL be the sum of the storage charge, all enabled additional charges, minus any credit notes applied to this period.

### FR-5: Multi-Currency Billing

1. Billing may be denominated in PHP or USD, per `vmi_contracts.billing_currency`.
2. All internal calculations SHALL use USD as the working currency.
3. The PHP equivalent SHALL always be computed at generation time using the locked forex rate: `amount_php = amount_usd × locked_exchange_rate_php`.
4. The PDF statement SHALL display the primary payable amount in `billing_currency`, with the cross-currency equivalent shown as a reference field.
5. The forex rate used SHALL be identified on the statement by source, effective date, and rate value.

### FR-6: Statement Delivery

1. Upon statement generation, the system SHALL:
   a. Generate a PDF using `04`'s artifact pipeline.
   b. Store the PDF in the private Supabase Storage bucket defined in `04`.
   c. Send the PDF as an email attachment to `parties.email` for the billed party via Resend.
2. The statement record SHALL store the PDF artifact ID from `04`.
3. Statement re-delivery SHALL be supported (re-send without regenerating a new statement number).
4. A statement with `status = 'voided'` SHALL NOT be re-delivered.

### FR-7: Statement Corrections and Credits

1. **Corrections** — if a generated statement contains an error, an Office Administrator MAY issue a correction:
   - The original statement SHALL be updated to `status = 'voided'`.
   - A new corrected statement SHALL be inserted as a new record with a new statement number.
   - The new statement SHALL reference the voided original via `supersedes_statement_id`.
   - Original statements are never deleted; they remain in the audit trail with `status = 'voided'`.
2. **Credit Notes** — credits to a vendor are recorded as separate `vmi_credit_notes` records:
   - A credit note reduces the payable amount on the **next** period's statement, never the current period.
   - Credit notes SHALL NOT cause a statement's net payable to fall below zero.
   - An applied credit note SHALL be marked `is_applied = true` and linked to the statement it was applied against via `applied_to_statement_id`.
   - Unapplied credit notes carry forward until applied or explicitly cancelled.

### FR-8: Separation from Per-Release Document Price

The VMI reference price on an acknowledgement receipt generated by `10-pick-list-and-acknowledgement-receipt` is derived from `items.selling_price` at dispatch time and is **informational only**. It represents a per-release indication of the item's value, not a billing event.

The authoritative VMI bill is always the period statement generated by this module. No single document total from `10` may be used as proof of billing, as a basis for payment obligation, or as a substitute for a period statement.

This separation SHALL be enforced by:

1. The acknowledgement receipt PDF template (spec `10`) including a disclaimer: "This document is a delivery reference only and does not constitute a billing statement."
2. This module never reading `pick_list_items.unit_price` as a billing input.
3. The `12-vmi-billing` schema having no foreign-key dependency on `pick_list_items.unit_price`.

---

## 4. Non-Functional Requirements

1. **Automation:** The daily CBM ledger MUST be updated automatically by a CRON job at 23:59 Asia/Manila time. Human intervention SHALL NOT be required for normal daily ledger maintenance.
2. **Immutability:** Once a `vmi_billing_statement` has `status = 'issued'`, its computed amounts, exchange rate, and period dates SHALL be strictly immutable. Database-level constraints or application-layer guards SHALL enforce this.
3. **Idempotency:** The CRON job SHALL safely re-run for dates already processed without creating duplicate ledger rows.
4. **Auditability:** Every ledger row SHALL record `calculated_at`. Every statement SHALL record `generated_by_user_id` and `generated_at`. Every voided statement SHALL retain its full row history.
5. **Timezone correctness:** All "end of day" and "calendar month boundary" computations SHALL use `Asia/Manila` (UTC+8). The CRON schedule and period boundary logic must explicitly convert to this timezone before applying date comparisons.

---

## 5. Out of Scope

The following charge categories are NOT modeled in this module:

- **Delivery & Distribution Tracking:** Delegated entirely to `19-dispatch-scheduling-and-delivery-tracking`. No delivery or freight charge is billed here.
- **Letter of Authority (LOA) Fees:** Discarded.
- **Manpower & Ad-Hoc Labor Fees:** Discarded.
- **Surety Bonds, CTF, and Trucking Admin Fees:** Discarded.
- **Accounts Receivable / General Ledger:** This module produces billing statements only. It does not manage payment receipts, outstanding balances, aging reports, or journal entries. Those are outside the scope of this warehouse system.

---

## 6. Acceptance Criteria

1. A `vmi_contracts` record correctly links a `party_id` to a `cbm_rate_usd`, `billing_currency`, optional `cbm_threshold_contracted`, optional charge-type rates, and three independent charge-type enable flags.
2. The CRON job runs at 23:59 Asia/Manila daily, creates exactly one `vmi_cbm_ledger` row per active VMI party, and is idempotent on re-run for the same date.
3. The `ending_cbm` in every ledger row equals `SUM(lot_inventory_totals.qty_remaining × items.volume_cbm)` for that party at the snapshot time, not a value derived from `inventory_transactions`.
4. A generated statement correctly computes `period_average_cbm` as the arithmetic mean of daily `ending_cbm` values, not a sum.
5. Additional charge lines (inbound handling, outbound handling, surcharge) appear on a statement if and only if the corresponding contract flag is `true`.
6. The forex rate is locked from `forex_rates.usd_to_php_rate` at generation time; a retroactive update to `forex_rates` does not change an already-issued statement.
7. Correcting a statement voids the original (status = 'voided'), inserts a new statement with a new number referencing the original, and never deletes the original record.
8. A credit note reduces the next period's payable amount only; it never causes a statement total to go negative.
9. An acknowledgement receipt generated by `10` contains a disclaimer identifying it as a delivery reference, not a billing statement.
10. The PDF artifact is stored in Supabase Storage and sent to the party contact email at issuance.
