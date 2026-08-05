# Input Notes — Real VMI Billing Documents (Dyna-Serv Global Corp, June 2026)

Status: Raw input, not yet formalized into requirements.md
Source: Draft_billing.pdf, CBM_MONTH_OF_JUNE_R1.xlsx, PR260026P_Phil_whse__07-01_.xls (actual production documents)
Informs: 12-vmi-billing primarily; also 01-core-data-model, 04-services-and-infrastructure, 17-product-categorization-and-classification, 19-dispatch-scheduling-and-delivery-tracking, and extends the CIPL/WRR notes already captured in 07-incoming-receiving

---

## What the real billing statement contains

Five distinct charge categories, plus a sixth (currently unused) placeholder — **not** the single `avg_cbm × cbm_rate × days` formula our schema currently implements:

1. **Warehousing** — daily CBM occupancy × rate. This is the only category our current `vmi_billing_periods`/`vmi_cbm_ledger` model covers.
2. **Handling IN / Handling OUT** — a separate charge based on total CBM *moved* during the period (157.18 cbm in, 262.96 cbm out in the sample month), not on CBM occupied. Has its own rate, calculated independently of the daily occupancy charge.
3. **Delivery & Distribution** — itemized per shipment: date, DR (delivery receipt) reference, consignee, delivery charge (**in PHP**), a flat documentation charge (**in USD**, commonly $10/shipment, sometimes $0), and free-text remarks (co-load, FG, Scrap/Reject, re-inspection, etc.).
4. **Letter of Authority (LOA)** — a flat regulatory/customs fee tied to a validity date (e.g. "Validity: June 2, 2027"), unrelated to CBM or shipment count. Appears to be PEZA-related (Philippine Economic Zone Authority) given the CIPL's "LT-SEZ" address and "PEZA DOCS REFERENCE" column seen in the operational detail.
5. **Manpower** — hours × rate, ad hoc labor billing (zero this month, but a real line item).
6. **Surety bond** — present as a line even at ₱0.00/"TBA," suggesting it's a standing charge category that's sometimes inactive, not something to omit from the schema just because it's zero in one sample.

All six roll into a **SUMMARY OF CHARGES** section with a stated exchange rate (61.71 PHP/USD in the sample) converting PHP-denominated lines into the final USD total, plus two more summary-only categories (**Trucking Administrative Fee**, **CTF/container transfer fee**) that don't appear broken out in the detail sections but do appear in the summary — meaning the summary total is not a pure rollup of the itemized sections; some charges are entered directly at the summary level.

## The daily CBM ledger — richer than our current model

The real warehousing ledger tracks, per day: **beginning cbm, IN (FG), IN (raw materials), OUT (raw materials), OUT, rate, amount** — a running daily balance (beginning + in − out = next day's beginning), not periodic point-in-time snapshots. The daily amount appears to be calculated off the day's **beginning** balance (the CBM that was actually in storage for that full day), not the post-movement ending balance — worth confirming precisely with source data before implementing, since this determines whether goods received today are billed starting today or starting tomorrow.

**Our current `vmi_cbm_ledger` table stores point-in-time snapshots (`cbm_occupied` per `snapshot_date`), not an explicit running ledger with beginning/in/out/ending columns.** The real business process visibly tracks the running balance as first-class data, split by IN category (FG vs raw material) — this is a real gap, not just a modeling preference, since IN category directly determines which billing sub-line an amount lands in.

## Goods classification — a real, billing-relevant dimension we don't model

Every transactional line in the operational spreadsheets is tagged: `FG` (finished goods), `FOR PROCESS` (raw material, not yet finished), `REJECT` (scrap/rejected), `RE INSPECT` (pending re-inspection). This is:
- Operationally relevant (drives what a lot's status should reflect)
- **Billing-relevant** (the CBM ledger's IN column splits by FG vs raw material specifically, because they may bill differently or roll into different reporting)

This is exactly the scope of `17-product-categorization-and-classification` — but note it's not purely a nice-to-have categorization feature, it's load-bearing for VMI billing accuracy.

## Multi-currency is real, not hypothetical

PHP delivery charges + USD everything-else, reconciled via a stated exchange rate into one USD total per statement. Current schema (`vmi_contracts.currency`, `documents.currency`) assumes one currency per contract/document — doesn't support mixed-currency line items within one billing statement.

## Multi-consignee receiving — extends the 07 input notes

The actual CIPL (invoice `PR260026P`, vendor "UBoT Incorporated Limited," shipped to Dyna-Serv's own warehouse) has a Weight Info sheet itemizing goods **by customer within one shipment** — ADGT, ATP, ST, UPI all appear as distinct consignees inside a single 40-foot-container shipment from one vendor. The CIPL/WRR staging model captured earlier in `07-incoming-receiving/input-notes.md` assumed a WRR maps cleanly to expected line items; this shows a single WRR may need to **fan out into multiple consignee/customer allocations** during receiving, not just reconcile against one expected customer.

## Delivery tracking — direct source material for spec 19

`CBM_MONTH_OF_JUNE_R1.xlsx`'s "Sheet5" is a real delivery-run tracking dataset: date, vendor (UPI/UBOT), consignee, quantity, carrier (e.g. "DATA FORCE," "TRI," "PICK UP"), on-time status, delivery status ("DELIVERED"), and the DR reference number tying back to the billing statement's Delivery & Distribution section. This is close to a ready-made schema sketch for `19-dispatch-scheduling-and-delivery-tracking`: `{date, vendor_party_id, consignee_party_id, qty, carrier, on_time_status, delivery_status, dr_reference}`.

## Open questions this raises for 12-vmi-billing's eventual requirements.md

1. Does `vmi_contracts` need a `cbm_rate` **and** a separate `handling_rate` (in/out, possibly different rates each direction), rather than the single `cbm_rate` it has now?
2. Should `vmi_cbm_ledger` be restructured into an explicit daily running-balance table (beginning/in_fg/in_raw/out_raw/out/ending/rate/amount) rather than point-in-time snapshots — and does "amount" get computed off beginning-of-day balance specifically?
3. Does delivery/documentation charging belong inside `12-vmi-billing` at all, or does it belong to `19-dispatch-scheduling-and-delivery-tracking` with `12` only owning the storage-side charges? The real statement bundles both into one document, but that may be a presentation choice, not a schema requirement to bundle them.
4. How are LOA, surety bond, manpower, trucking admin fee, and CTF meant to be modeled — as configurable line-item types on a contract, or as separate, mostly-optional tables? They're infrequent/often-zero but clearly part of the real billing template.
5. Exchange-rate handling: stored per billing period (locked at generation time, like the Trading price-snapshot pattern already established for `document_lines`), or fetched live? Given `document_lines.unit_price` is already snapshotted at generation and never changes retroactively, the same pattern likely applies here — worth confirming rather than assuming.
