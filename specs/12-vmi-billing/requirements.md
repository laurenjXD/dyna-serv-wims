# VMI Billing — Requirements

Status: Approved
Updated: 2026-08-19 (Full rewrite — replaces the CBM-only period-average model with the SOA billing pipeline, grounded in a real June 2026 billing cycle: `Draft billing.pdf`, `CBM MONTH OF JUNE R1.xlsx`, `PR260026P` commercial invoice)

Supersedes the prior `Status: Approved` version of this document in full. The prior schema (`vmi_contracts`/`vmi_cbm_ledger`/`vmi_billing_statements`/`vmi_credit_notes`, end-of-day-only CBM snapshot, `period_average_cbm × rate × days`) is retired, not extended — see `design.md` for the replacement schema and the reasoning recorded in `specs/00-steering/revision-log.md`.

## 1. Purpose and scope

VMI Billing computes and issues a VMI party's monthly commercial documents from two immutable sources — the warehouse's own movement history and a per-party rate card — never from hand-entered totals. It replaces a spreadsheet-built Statement of Account with a system that replays real events every time.

Four documents are generated together, per party, per calendar month, in one period-close action:

1. **Billing Statement** — itemized charge computation for the period, grand total.
2. **Warehousing Charges** — day-by-day beginning/IN/OUT/ending CBM supporting schedule for the Warehousing line.
3. **SOA (Statement of Account)** — opening balance (carried from the prior period) + this period's Billing Statement total − payments received = balance due. A real running accounts-receivable balance across periods, not a per-period-isolated figure.
4. **Letter of Authority (LOA)** — compliance document authorizing specific item types for a permit's validity window; a mail-merge of `Permit` fields, not a computed document, but still regenerated at every period close alongside the other three so all four carry the same period/revision numbering.

### Terminology Alignment

Across all user-facing billing screens, forms, headers, and statement previews:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Actors and access boundaries

- **Supervisor & Administrator** — access billing features via `reporting.financial_read`. Only Administrator may close a period, record a payment, or issue a correction.
- **Organization User** — views their own party's issued documents (PDF artifacts) in **Organization Portal** (`/portal/documents`), via the existing, separately-approved `vmi_statements.read` surface (`22-parties-portal`). Never reaches the office `/billing-pricing` route.

## 3. Document Architecture

`/billing-pricing` (shared with `13`, see `design.md` §6) has two sub-tabs:
1. **VMI Billing**: Contract configuration, movement-derived daily ledger inspection, charge-line entry for delivery/documentation/ad-hoc fees, period close, and the four-document history.
2. **Trading Pricing**: owned by `13`.

## 4. Functional requirements

### FR-1: Contract Terms (per-party rate card)

1. System maintains `vmi_contract_terms` as an **effective-dated version history per VMI party** — the same `effective_from`/`effective_to`/`is_active` shape `13-trading-orders-and-pricing` already uses for `trading_policies` — storing: `storage_rate_per_cbm_day`, `billing_timing` (`beginning_of_day` | `end_of_day` — resolves which day's balance storage is priced against; **confirmed against real June data**: the evidenced contract bills off the **beginning**-of-day balance, but the field is configurable per party, not hardcoded), `handling_in_rate_per_cbm`, `handling_out_rate_per_cbm` (independently configurable — evidenced as equal in June's real contract, but nothing requires that), `documentation_default_rate_usd` (a **default**, not a locked formula — see FR-4), `cbm_threshold_type` (`none` | `minimum_billable` | `included_allowance`, defaulting to `none`; the June data shows no evidence of a threshold ever being used — this stays optional, never assumed), `cbm_threshold`, `over_threshold_rate`, and `billing_currency`.
2. A party may additionally carry zero or more `vmi_recurring_fee_lines` rows (LOA fee, surety bond, trucking administrative fee, manpower rate-per-hour, and any future flat/recurring type) — **evidenced as four distinct types in the real June statement**, not the two the initial design sketch assumed. This is an open list, not a fixed enum of two.
3. A rate edit never overwrites an existing `vmi_contract_terms` row's values; it closes the currently open-ended version (`effective_to` set) and inserts a new one. Both the nightly balance-replay job (FR-2) and any historical backfill resolve "the rate in effect" by date against this version history, not against "whatever the contract currently says" — this is what keeps a mid-period or after-the-fact rate change from ever retroactively repricing a day that already happened, for storage, handling, and the documentation default alike.

### FR-2: Daily balance replay (movement-sourced, not manually entered)

1. The system computes, per VMI party per calendar day, `balance(day) = balance(day-1) + IN(day) − OUT(day)`, replayed from the existing `inventory_transactions` ledger (joined to `lots`/`items` for CBM) — **no separate movement-event table is introduced**; `inventory_transactions` already is the immutable IN/OUT log this project uses everywhere else.
2. IN and OUT are each additionally split by category (`FG`, `RAW_MATERIAL`, `FOR_PROCESS`, `REJECT`, `RE_INSPECT` — the exact values found in the real `CBM MONTH OF JUNE` sheet) for the ledger's display columns and Handling totals. Category is informational/reporting only — it never changes the applicable rate. **Sourced from `items.vmi_movement_category`** (a `01-core-data-model` amendment added 2026-08-19, a fixed property of the item rather than something that varies per lot/transaction — Product Owner decision; see `design.md` §2.1 and `specs/00-steering/revision-log.md`). Nullable; items with no category set contribute to an "Uncategorized" bucket rather than being silently excluded from CBM totals.
3. A nightly job snapshots one immutable row per party per day into `vmi_daily_balance_ledger`: beginning CBM, ending CBM, IN/OUT by category, the storage rate in effect *that night*, and the resulting dollar amount — priced same-day so a mid-month rate change never retroactively reprices already-elapsed days.
4. **Verified against real data**: `beginning_cbm(day) × rate = daily_amount` (June 1: `792.02 × $0.05 = $39.60`); summed across the period, `SUM(daily_amount) = $1,116.90`, and `first_day_beginning + total_IN − total_OUT = last_day_ending` (`792.02 + 157.18 − 262.96 = 686.24`), both matching the real June statement exactly.

### FR-3: Storage charge and optional threshold

1. `storage_charge_usd = SUM(vmi_daily_balance_ledger.daily_amount_usd)` over the billing period.
2. When `cbm_threshold_type = minimum_billable`: `billed_cbm = MAX(billed_balance, cbm_threshold)` before pricing.
3. When `cbm_threshold_type = included_allowance`: the portion within `cbm_threshold` prices at `storage_rate_per_cbm_day`; the excess prices at `over_threshold_rate`.
4. When `cbm_threshold_type = none` (the default and the only mode evidenced by real data), the formula reduces to the plain `balance × rate` shown above.

### FR-4: Handling, Documentation, and Delivery charges

1. **Handling** is computed directly from movement replay, aggregated over the period, **priced day-by-day against whichever `vmi_contract_terms` version was effective on that specific day** (per FR-1.3) then summed — `handling_in_usd = SUM(day.IN.cbm × day's effective handling_in_rate_per_cbm)` for every day in the period, symmetric for OUT. When no rate change occurs within the period this reduces to the simpler `total_IN.cbm × handling_in_rate_per_cbm`, which is what the real June fixture exercises (no rate change that month). **Not** an individually-entered charge line per shipment (verified: the real statement's Handling total is a period aggregate, matching the Warehousing Charges schedule's own IN/OUT column sums, not a sum of manual per-DR entries).
2. **Documentation** defaults to `contract.documentation_default_rate_usd` per DR/AR reference (evidenced default: `$10.00`), but an authorized user may override the amount per line — the real statement shows genuine `$0.00` exceptions on specific shipments with no clean pattern tied to remarks, confirming this is a default-with-override, not an unconditional formula.
3. **Delivery** is always a manual entry per delivery run — the real trucking invoice amount, in PHP, which may cover multiple DR references sharing one delivery (batched by date + consignee in the real data). There is no rate-card formula for delivery. `delivery_usd = SUM(delivery_php for period) / period.locked_fx_rate` (verified: `₱40,896.00 / 61.71 = $662.71`, exact).
4. Documentation and Delivery (and any ad-hoc type — RTV, Insurance, Cargo Transfer Fee, Admin Fee) are recorded as `vmi_charge_lines`, each attached to one `generated_documents` row with `document_type = 'acknowledgement_receipt'` (the existing, already-approved DR/AR document from `10-pick-list-and-acknowledgement-receipt` — no new reference chain is introduced; `10` has no separate `acknowledgement_receipts` table, an AR is a `generated_documents` row). Warehousing and Handling are never represented as `vmi_charge_lines`; they are always sourced from movement-replay aggregates per FR-2/FR-3 above and this clause.

### FR-5: Recurring fixed charges

1. Each active `vmi_recurring_fee_lines` row contributes its configured flat amount to the period's Billing Statement, except **Manpower**, which is `hours_logged × rate_per_hour` (rate stored in its native currency, e.g. PHP) and requires an explicit hours entry per period — it contributes `$0`/omits from the statement when no hours are logged, matching the real June statement's treatment.
2. A recurring fee tied to a `vmi_permits` row (i.e. the LOA fee) inherits its amount from `vmi_permits.monthly_fee_usd`.

### FR-6: Statement assembly and forex

1. `total_amount_usd` = storage charge + handling in + handling out + documentation + delivery + SUM(active recurring fee lines) + SUM(ad-hoc charge lines) − credits applied (clamped at 0).
2. Forex rate (`usd_to_php_rate`) is fetched from `forex_rates` and locked permanently at period-close time. Missing rate blocks period close with a clear error.
3. **Verified against real data**: summing all nine of June's real line items reproduces the statement's `$3,023.80` grand total exactly.

### FR-7: SOA and payments

1. `vmi_soa_periods.opening_balance` for a party's period N equals period N-1's `closing_balance` (the running AR balance) — never recomputed in isolation.
2. `closing_balance = opening_balance + this_period_billing_statement_total − payments_applied_this_period`.
3. Payments (`vmi_payments`: amount, date, type — `payment` | `credit_memo` | `adjustment`, applied period) are entered manually by an Administrator against one specific period. Partial payments are permitted; nothing auto-imports from an external payment feed in this build.

### FR-8: Letter of Authority

1. `vmi_permits` (party, permit number, item scope, validity window, monthly fee) is CRUD-managed independently of the billing cycle.
2. The LOA document is regenerated at every period close alongside the other three documents, even though its content (permit details) rarely changes between periods — all four documents share the same period/revision numbering and issuance timing.

### FR-9: Period close and corrections

1. A period close is one atomic action: lock the date range, snapshot every `vmi_daily_balance_ledger` row and `vmi_charge_lines` row in range (no further edits to in-range rows after close), compute and store the Billing Statement/Warehousing Charges/SOA/LOA content, generate all four PDF artifacts via `04`'s pipeline, and mark the period `issued`.
2. Corrections never edit an issued period. A correction voids the original period record and issues a new one with an incremented revision suffix, re-running the full close algorithm for the same party/month — matching the void-and-reissue pattern already established elsewhere in this project (e.g. WRR corrections).

### FR-10: Authorization & Visual Design

1. Gated by `reporting.financial_read` for Supervisor and Administrator; period close and payment recording additionally require an Administrator-only capability (final identifier owned by `02-rbac-roles`).
2. UI matches the visual system already live throughout this app (not the separate Etna/Glacial-Indifference token set referenced in the prior draft of this document — see `revision-log.md`).
3. All error boundaries display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).

## 5. Acceptance criteria

- [ ] Daily balance ledger replays `inventory_transactions` correctly for both `billing_timing` modes and matches real June fixture data exactly.
- [ ] Storage charge sums pre-priced daily amounts, never a period-average × rate × days formula.
- [ ] Handling is a period-aggregate computed from movement replay, never a manually-entered line.
- [ ] Delivery is always manual, converted at the period's locked FX rate.
- [ ] Documentation defaults from contract but is overridable per line.
- [ ] All four documents (Billing Statement, Warehousing Charges, SOA, Letter of Authority) generate together from one period-close action and reproduce the real June 2026 fixture's `$3,023.80` grand total exactly.
- [ ] SOA opening balance carries forward from the prior period's closing balance.
- [ ] Issued periods are immutable; corrections void and reissue, never edit in place.
- [ ] User-facing UI labels use Organization, Inventory Model, and Organization Portal exclusively.
- [ ] Financial features are gated by `reporting.financial_read`; period close/payments additionally require Administrator.
- [ ] 3-component error feedback is present on all billing/forex errors.
