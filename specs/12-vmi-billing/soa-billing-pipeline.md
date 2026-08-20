# SOA Billing Pipeline — Design & Implementation Plan

Derived from the June 2026 Dyna-Serv billing cycle (CBM ledger, DR log, UBoT commercial invoice).
Goal: make the Statement of Account (SOA) a **computed output**, not a manually-built spreadsheet.

---

## 1. Core principle: event-sourced ledger, not stored balances

Every number on the SOA is derived from two kinds of immutable events:

- **Movement events** — an IN or OUT of inventory, tagged with CBM, party, item, flow_type, and a WR/DR reference
- **Rate/contract config** — per-party rates that rarely change (storage $/cbm/day, handling $/cbm, doc fee, FX source)

Daily balances, handling totals, and charges are never manually entered — they're **replayed** from the movement log. This matters specifically because Hyperion's offline sync (Dexie.js, Tier 1/2) means a scanner can log a movement offline and sync hours later. If balances were stored/mutated directly, late-arriving offline events would corrupt the running total. If balances are always derived by replay, a late-synced event just gets inserted into the timeline and everything downstream recomputes correctly.

```
Movement Event
├─ id
├─ date
├─ party_id            // UPI, UBOT, ADGT, AMPLEON, ST, ATP, AMERTRON, AMKOR...
│                        // role is contextual, not a fixed attribute — see note below
├─ item_id
├─ direction            // IN | OUT
├─ category             // FG | RAW_MATERIAL | REJECT | FOR_PROCESS | RE_INSPECT
├─ cbm
├─ flow_type            // VMI | TRADING
├─ reference            // WR-xxx / DR-xxx / UPIxxxxx (the dr_ar_ref)
└─ sync_status          // for offline Tier1/2 reconciliation
```

**No separate warehouse entity.** There's a single physical facility — what looked like "UPI" and "UBOT" as warehouse locations in the source CBM sheets are actually `party_id`s. The daily balance being tracked is *that party's inventory sitting in the one warehouse*, not two different physical spaces.

**Pooled vs. per-party balance — why this design tracks per-party.** The June source statement shows UBoT billing Dyna-Serv on one *pooled* daily balance across all clients combined — simple to compute, but impossible to audit down to an individual client (no way to show AMERTRON specifically what share of the $1,116.90 was theirs). This design tracks balance per `party_id` instead, which is what lets Dyna-Serv eventually re-bill its own downstream clients defensibly, with every charge traceable to specific movement events rather than a pooled share. The marginal cost is low, since `party_id` is already captured on every Movement Event regardless.

The same `party_id` plays a different role depending on `flow_type`:
- **`flow_type: VMI`** — the party is the **vendor** whose inventory Dyna-Serv is storing and managing (e.g. ADGT, AMPLEON, ST, AMERTRON, AMKOR, UPI)
- **`flow_type: TRADING`** — the party is the **supplier** goods are being sourced from (e.g. UBoT)

So role isn't a fixed field on `Party` — it's derived from which flow_type the transaction belongs to. A party could in principle appear in both roles across different transactions; the Movement Event's `flow_type` is what disambiguates it at read time, not a static label on the party record.

---

## 2. Pipeline stages

### Stage 0 — Ingestion
Three independent producers write Movement Events into the same table:
1. **Receiving flow** (warehouse scanner / pick_list intake) → IN events
2. **Delivery/pick flow** (acknowledgement_receipt on dispatch) → OUT events, carries the DR reference and delivery cost fields
3. **Trading invoice import** (UBoT commercial invoice, e.g. `PR260026P`) → IN events tagged `flow_type: TRADING`, with unit_price × qty as landed cost, not CBM-rated

### Stage 1 — Daily balance derivation (per party)
```
balance(day) = balance(day-1) + Σ IN.cbm(day) - Σ OUT.cbm(day)
```
Run once per party per billing period. This produces the same table structure as `CBM_MONTH_OF_JUNE`: beginning, IN (FG/RAW), OUT (FG/RAW), ending — just scoped to a party's inventory rather than a separate warehouse.

### Stage 2 — Storage charge
```
if contract.cbm_threshold_type == "minimum_billable":
    billed_cbm = max(balance(day, "beginning"), contract.cbm_threshold)
    storage_charge(day) = billed_cbm × contract.storage_rate_per_cbm_day

if contract.cbm_threshold_type == "included_allowance":
    within = min(balance(day, "beginning"), contract.cbm_threshold)
    over   = max(0, balance(day, "beginning") - contract.cbm_threshold)
    storage_charge(day) = (within × contract.storage_rate_per_cbm_day)
                         + (over × contract.over_threshold_rate)

warehousing_total = Σ storage_charge(day) for all days in period
```
Confirmed against June: `792.02 × 0.05 = $39.60` for day 1 — rate applies to the **beginning-of-day** balance, not ending or average. **Note: `cbm_threshold` is speculative, not evidenced.** The June statement shows a flat, uncapped rate applied to one pooled balance for the whole facility — no minimum, no tier, no threshold anywhere in the source data. `cbm_threshold`/`cbm_threshold_type` is included as an optional field in case a specific client contract turns out to use one, but it should not be treated as a confirmed requirement until you have an actual contract showing it. Left at `cbm_threshold: 0`, the logic is a no-op and storage charge reduces to the plain `balance × rate` formula the source data actually shows.

### Stage 3 — Handling charges
```
handling_in_cbm   = Σ IN.cbm  for period
handling_out_cbm  = Σ OUT.cbm for period
handling_in_usd   = handling_in_cbm  × contract.handling_in_rate_per_cbm
handling_out_usd  = handling_out_cbm × contract.handling_out_rate_per_cbm
```
Confirmed: `157.18 × 1.40 = $220.05`, `262.96 × 1.40 = $368.14`. Inbound and outbound rates are modeled separately — they happened to match in June, but nothing requires that.

### Stage 4 — Delivery & documentation
```
For each OUT event with a DR/WR reference:
    delivery_php  += event.delivery_cost_php     // actual trucking cost, PHP
    doc_usd       += event.doc_fee_usd            // flat per-DR fee, USD

delivery_usd = delivery_php / period.fx_rate
```
Confirmed: `₱40,896.00 / 61.71 = $662.71` exact match to the statement. This is the one place PHP and USD mix — delivery cost is a real trucking invoice in pesos, everything else is quoted natively in USD.

### Stage 5 — Fixed/recurring charges
Pulled from a `contract_terms` config, not computed from movements:
- LOA fee (amortized against permit validity window, e.g. `ELSE-LTP1-IE-007994-26E` → June 2027)
- Surety bond
- Trucking administrative fee
- Manpower: `hours_logged × rate_per_hour`

### Stage 6 — Trading leg (parallel, separate pipeline)
The UBoT commercial invoice doesn't touch the storage/handling engine at all — it's a straight goods-sale computation:
```
line_amount = unit_price × qty
invoice_total = Σ line_amount, grouped by consignee + HS code
```
This feeds inventory-in at landed cost (for trading-flow items) but never enters the CBM storage-rate calculation for the *supplier* leg — it only starts accruing storage/handling once it's received into the PH warehouse as a normal IN event.

### Stage 7 — Assembly
```
SOA = {
  warehousing_total,          // Stage 2
  delivery_usd, doc_usd,      // Stage 4
  handling_in_usd, handling_out_usd,  // Stage 3
  loa_fee, surety_bond, trucking_admin_fee, manpower_cost,  // Stage 5
  grand_total: sum(all above),
  grand_total_words: numberToWords(grand_total)
}
```
Render into the existing statement layout (daily warehousing table + DR-level delivery table + summary block) as PDF/print view.

---

## 3. Where this fits in Hyperion's spec structure

Given the existing `parties / items / locations` model and VMI-vs-trading `flow_type` distinction already established:

| New spec area | Responsibility |
|---|---|
| `movement-events` | Immutable event log; single source of truth for all IN/OUT, replaces any "current stock" mutable field |
| `contract-terms` | Per-party rate card: storage rate, handling rate, doc fee, recurring fixed charges, FX source |
| `billing-engine` | Pure functions, Stages 1–6 above — no I/O, fully unit-testable with Vitest against fixture ledgers like the June data |
| `soa-generator` | Takes engine output + billing period → produces the statement document object → template renders it |
| `trading-invoice-import` | Parser for supplier commercial invoices (UBoT-style), maps line items to Movement Events with `flow_type: TRADING` |

### Suggested build order
1. **`movement-events` + `contract-terms` schemas** — get the data model right first, since everything downstream depends on it
2. **`billing-engine`** as pure, offline-testable functions — write Vitest fixtures directly from this June data (you already have verified expected outputs: $1,116.90 warehousing, $220.05/$368.14 handling, $662.71 delivery) so the engine has a real regression test from day one
3. **Ingestion adapters** — wire the receiving/delivery flows in the scanner UI to emit Movement Events; wire a one-off importer for supplier invoices (xls/PDF) since those won't come through the scanner
4. **`soa-generator`** — template + render, last, once the numbers are provably correct

This order means you can validate the hardest part (the math) against real historical statements before touching any UI, which matters a lot for an offline-first, spec-driven build.

---

## 4. Decisions (resolved)

- **Storage rate timing**: fixed at start-of-day balance for all parties. Not configurable per party — this is a rule in the engine, not a `contract-terms` field.
- **LOA fee**: a recurring monthly flat charge, same treatment as trucking admin fee. No amortization/validity-window logic needed.
- **Handling rate ($/cbm) and doc fee ($/shipment)**: **per-party**, not global. `contract-terms` must be keyed by `party_id` — each customer carries its own rate card.

This means `ContractTerms` is a per-party table, not a single global config:

```
ContractTerms
├─ party_id                        // one row per customer
├─ storage_rate_per_cbm_day        // per-party, default $0.05
├─ handling_in_rate_per_cbm         // per-party, inbound — can differ from outbound
├─ handling_out_rate_per_cbm         // per-party, outbound — can differ from inbound
├─ doc_fee_per_shipment            // per-party, e.g. $10 (can differ by party)
├─ cbm_threshold                    // volume breakpoint, 0 if not used
├─ cbm_threshold_type                // "minimum_billable" | "included_allowance"
├─ over_threshold_rate                // only used if type = included_allowance
├─ recurring_fees[]                // e.g. { name: "LOA", amount: 36, frequency: "monthly" }
└─ fx_source                       // which FX rate to pull, typically shared across parties
```

Stages 2–4 in the pipeline above now read `contract.rate_for(party_id)` instead of a single global constant — the math is unchanged, just scoped per party.

---

## 5. UI architecture: Outgoing → Logistics tab, and the VMI Billing & Trading module

### Outgoing page → Logistics tab
A copy of the outgoing ledger table, with CRUD to attach charge-type line items to each outgoing/delivery row. This is the atomic charge-entry layer — where the movement events from Section 1 pick up a dollar amount.

```
ChargeLine (attached to an outgoing ledger row)
├─ dr_ar_ref        // FK to acknowledgement_receipt — the canonical reference, always DR/AR
├─ party_id
├─ charge_type      // enum: Warehousing, Documentation, Delivery, Handling & Stripping,
│                    //   Cargo Transfer Fee, RTV, Admin Fee, Insurance, Man Power
├─ amount
├─ currency          // PHP (delivery) or USD (everything else)
├─ source            // "auto" (from contract-terms rate) or "manual" (ad hoc, e.g. RTV/Insurance)
└─ date
```

**Reference chain**: `pick_list` (internal picking instruction — origin of item/CBM quantities) → `acknowledgement_receipt` / DR-AR (generated on dispatch, carries the customer-facing reference number, e.g. `WR-UPI-260546`, `UPI00233`) → `ChargeLine` and the Movement Event both key off the DR/AR reference, never the pick_list directly.

```
acknowledgement_receipt (DR/AR)
├─ dr_ar_ref          // the number everything downstream points to
├─ pick_list_id        // FK back to source pick_list, for audit traceability
├─ party_id
├─ item / cbm           // carried forward from pick_list at time of dispatch
└─ date
```

The Logistics tab can display pick_list-derived columns (item, CBM) alongside DR/AR fields, but every charge encoded there is always attached to the DR/AR — that keeps one stable reference used consistently across the Daily Accrual Dashboard, Billing Statement, and SOA, with a clean trace back to the originating pick_list if needed.

`source: auto` types (Warehousing, Handling, Documentation) auto-populate from `ContractTerms`. `source: manual` types (RTV, Insurance, Cargo Transfer Fee) are inherently ad hoc per shipment and need staff CRUD entry — there's no formula for "this shipment got returned to vendor."

### VMI Billing & Trading module
Sits one level above ChargeLines — the rollup/reporting layer:

- **Contract Configuration** — the per-party `ContractTerms` rate card (Section 4). Drives the "auto" ChargeLines.
- **Daily Accrual Dashboard** — live, read-only rollup of ChargeLines by party + charge_type + day, running month-to-date. The open-period view before anything is finalized.
- **SOA Management** — the period-close process: locks a date range per party, snapshots every ChargeLine in it, and generates the official documents (Section 6). Once issued, that period is immutable — no backdated ChargeLine edits.

**Billed daily, issued monthly**: ChargeLines accrue continuously as shipments happen (always open, always editable pre-close). SOA Management takes a snapshot at month-end, freezes it, and emits the documents — same pattern as the source data's daily CBM ledger feeding one monthly statement.

---

## 6. The four generated documents

| Document | Purpose | Data source |
|---|---|---|
| **Billing Statement** | Itemized computation for the period — ChargeLines summed by charge_type + grand total | `billing-engine` output for the locked period (pipeline Stages 2–5) |
| **Warehousing Charges** | Supporting schedule for the Warehousing line — day-by-day beginning/IN/OUT/ending CBM and daily amount | `billing-engine` Stage 1–2, unrolled daily instead of summed |
| **SOA (Statement of Account)** | AR-facing document: opening balance + this period's Billing Statement total − payments received = balance due | Billing Statement total + `Payment` ledger (new entity) |
| **Letter of Authority** | Compliance/permit document authorizing specific item types for a validity window — not computed, closer to a mail-merge of permit fields into a legal template | `Permit` entity (new), largely independent of the billing period |

Two new entities support this:

```
Payment (feeds SOA)
├─ party_id
├─ date
├─ amount
├─ type               // payment | credit_memo | adjustment
└─ applied_to_period  // which billing period this reduces

Permit (feeds Letter of Authority)
├─ party_id
├─ permit_number        // e.g. ELSE-LTP1-IE-007994-26E
├─ item_scope           // e.g. "Reel, carrier tape, tray"
├─ valid_from / valid_to
└─ monthly_fee           // the recurring line that also shows up on the Billing Statement
```

### Generation flow
All four documents come from **one period-close action** in SOA Management, not four separate steps:
1. Trigger **close period** for a company + month
2. Lock the date range, snapshot all ChargeLines in it (no further edits)
3. Render all four templates from that snapshot: Billing Statement (grouped by charge_type) → Warehousing Charges (Warehousing ChargeLines, unrolled daily) → Letter of Authority (from `Permit`, mostly static) → SOA (Billing Statement total + prior balance + `Payment` records)
4. Number/stamp all four as issued; the period becomes read-only

---

## 7. Trading flow: how it plugs into the same reference chain

Trading rides the same `dr_ar_ref` chain as VMI, but adds a second dimension — a trading shipment isn't just a service fee, it's also a goods sale. The discriminator is `flow_type` on the Movement Event (VMI vs TRADING), set back in Stage 0.

- **VMI flow** — customer already owns the goods. The DR/AR only ever generates `ChargeLine`s.
- **TRADING flow** — Dyna-Serv owns the goods (bought from UBoT) and is selling them onward. The DR/AR still generates the normal `ChargeLine`s (a trading shipment still gets handled, delivered, documented) — **plus** a `TradingInvoiceLine`, the cost-of-goods component that's entirely absent from VMI.

```
Inbound (purchase):
UBoT Commercial Invoice → IN Movement Event, flow_type: TRADING
  → TradingInvoiceLine, direction: PURCHASE, party: UBoT

Outbound (sale/distribution):
pick_list → acknowledgement_receipt (DR/AR) → OUT Movement Event, flow_type: TRADING
  → same dr_ar_ref generates:
      • ChargeLine(s)         — service fees, same as any VMI shipment
      • TradingInvoiceLine    — direction: SALE, party: consignee, cost of goods
```

On the Logistics tab, a trading-flow DR/AR row shows both the standard charge-type CRUD *and* a goods-cost line; a VMI-flow row only shows charge types. Same table, same reference, `flow_type` decides what else is attached.

Note: the trading side's own document set (Commercial Invoice / Packing List / Weight Info, matching the `PR260026P` structure) is separate from the four VMI documents in Section 6, built off `TradingInvoiceLine` rather than `ChargeLine` — out of scope until the VMI side is settled.

---

## 8. Trading policy and unified Contract Configuration

Trading has its own rate-card dimension — buy cost, margin, sell price, currency — parallel to (but structurally distinct from) the VMI rate card. Both live in Contract Configuration as separate policy types, keyed the same way `ContractTerms` already is.

```
TradingPolicy (Contract Configuration — trading side)
├─ party_id             // consignee being sold to
├─ item_id               // margin can differ by item, not just by customer
├─ buy_cost              // cost basis, sourced from supplier invoice (UBoT) or a standing contracted rate
├─ buy_currency           // USD, typically — matches UBoT invoicing
├─ margin_type            // percentage | fixed_amount
├─ margin_value            // e.g. 15%, or a flat $/unit markup
├─ sell_price               // buy_cost adjusted by margin — system-derived or manually overridden
├─ sell_currency             // may differ from buy_currency (bought USD, sold PHP)
├─ fx_source                  // applies if buy/sell currencies differ
└─ effective_from / effective_to
```

`TradingPolicy` is the rule, not the transaction — same relationship `ContractTerms` has to `ChargeLine`. The actual sale snapshots it:

```
TradingInvoiceLine (updated — snapshots the policy at time of sale)
├─ dr_ar_ref / supplier_invoice_ref
├─ direction              // PURCHASE (from UBoT) | SALE (to consignee)
├─ party_id
├─ item_id
├─ qty
├─ buy_cost                // snapshotted from TradingPolicy
├─ sell_price                // snapshotted
├─ margin_amount              // sell_price − buy_cost, captured at moment of sale
├─ currency
└─ hs_code
```

Snapshotting matters for the same reason it does on the VMI side: if `TradingPolicy` margin rules change next month, already-issued invoices from this month shouldn't silently recompute.

```
Contract Configuration
├─ ContractTerms (VMI)      — storage rate, handling rate, doc fee, recurring fees
└─ TradingPolicy (Trading)   — buy cost, margin rule, sell price, currency
```

Both are CRUD-managed in the same module, keyed by `party_id` (`TradingPolicy` additionally by `item_id`). A VMI-only party never touches `TradingPolicy`; a party doing both gets rows in each, and each policy type feeds its own downstream engine — `ContractTerms` → `ChargeLine`, `TradingPolicy` → `TradingInvoiceLine`.
