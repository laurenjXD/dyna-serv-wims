# VMI Billing — Requirements

Status: Draft

Depends on:
- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/01-core-data-model/` (Depends heavily on `items.volume_cbm` and `lots`)
- `specs/02-rbac-roles/`

---

## 1. Overview

The VMI (Vendor Managed Inventory) Billing module automatically tracks the physical storage space (Cubic Meters or CBM) occupied by a vendor's inventory inside the warehouse on a daily basis. 

To prevent the system from bloating into a complex accounting ERP, this module employs a **strictly simplified approach**. It focuses purely on automated, CBM-based inventory occupancy billing derived directly from the physical inventory data, stripping out manual, ad-hoc, and delivery-related charges.

---

## 2. Goals

- Provide an automated daily ledger (`vmi_cbm_ledger`) that calculates the exact CBM occupied per vendor.
- Calculate CBM mathematically using the baseline `volume_cbm` data captured during Item Enrollment (Spec 01) multiplied by physical quantities.
- Generate monthly billing statements that lock in the USD to PHP exchange rate.
- Serve as the authoritative source for storage charges without managing the entirety of the vendor's financial accounts.

---

## 3. Functional Requirements

### FR-1: VMI Contracts
1. The system SHALL maintain a simple `vmi_contracts` record for any `party` enrolled as a VMI vendor.
2. The contract SHALL store a single, unified `cbm_rate` (expressed in USD per CBM).

### FR-2: The Daily CBM Ledger
1. The system SHALL maintain an automated daily running ledger (`vmi_cbm_ledger`) for every active VMI vendor.
2. The ledger SHALL record the following daily values per vendor:
   - **Date**
   - **Beginning CBM:** The total volume carried over from the previous day.
   - **Inbound CBM:** The total volume of items received into the warehouse on this date.
   - **Outbound CBM:** The total volume of items picked/withdrawn from the warehouse on this date.
   - **Ending CBM:** Calculated as `Beginning CBM + Inbound CBM - Outbound CBM`.
3. The CBM calculations SHALL be strictly derived from the `qty` of the `inventory_transactions` multiplied by the `volume_cbm` of the respective `items`.

### FR-3: Monthly Billing Generation
1. At the end of a billing cycle, an Office Administrator SHALL generate a `vmi_billing_statement`.
2. The statement generation SHALL automatically sum the `Ending CBM` for every day in the billing period to establish the **Total Billable CBM**.
3. The system SHALL multiply the **Total Billable CBM** by the vendor's contracted `cbm_rate` to calculate the final USD amount.
4. The system SHALL fetch the daily `forex_rate` for the date of generation and **lock in** the USD to PHP exchange rate permanently on the generated statement. Retroactive changes to the forex table SHALL NOT alter generated statements.

---

## 4. Non-Functional Requirements & Performance
1. **Automation:** The daily CBM ledger MUST be updated automatically. A backend CRON job or database trigger SHALL evaluate the day's `inventory_transactions` and append the new daily ledger row at 00:00 midnight without human intervention.
2. **Immutability:** Once a `vmi_billing_statement` is generated, its mathematical totals and exchange rate SHALL become strictly immutable.

---

## 5. Out of Scope

As per the simplified billing architecture, the following charge types are **strictly out of scope** and will NOT be modeled in this application:
- **Delivery & Distribution Tracking:** (Delegated entirely to `19-dispatch-scheduling-and-delivery-tracking`; no financial charges for delivery are billed here).
- **Handling IN / Handling OUT Fees:** (Discarded in favor of the single unified CBM occupancy rate).
- **Letter of Authority (LOA) Fees:** (Discarded).
- **Manpower & Ad-Hoc Labor Fees:** (Discarded).
- **Surety Bonds, CTF, and Trucking Admin Fees:** (Discarded).

---

## 6. Acceptance Criteria
1. The `vmi_contracts` table correctly links a `party_id` to a single USD `cbm_rate`.
2. The `vmi_cbm_ledger` successfully calculates daily beginning, in, out, and ending CBM balances based on actual item `volume_cbm` data.
3. The monthly billing statement accurately multiplies the sum of daily CBM by the contract rate and safely locks the exchange rate at generation time.
