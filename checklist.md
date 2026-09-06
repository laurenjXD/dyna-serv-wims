# Dyna-Serv WIMS — Milestone 3 & 4 Implementation Checklist

> **Canonical Execution Checklist** for completing Milestone 3 (Inventory Control & Analytics) and Milestone 4 (Handover & Deployment).  
> All tasks are grouped logically and trackable with checkboxes.

---

## 1. VMI Billing & Storage Calculations

- [ ] **Task 01:** Compute each vendor's daily storage volume balance ($\text{Beginning} + \text{Received} - \text{Withdrawn}$) using item dimensions ($L \times W \times H \rightarrow \text{CBM}$).
- [ ] **Task 02:** Aggregate daily CBM balances at period close and multiply by active contract rate schedules.
- [ ] **Task 03:** Auto-calculate inbound handling, outbound pick, and staging fees for billing statements.
- [ ] **Task 04:** Compute billing subtotals, tax treatments (VAT, Non-VAT, PEZA exemptions), and deductions.
- [ ] **Task 05:** Enable supervisor review, mandatory adjustment notes, and immutable billing statement (SOA) locking.

---

## 2. Trading Pricing & Margin Engine

- [ ] **Task 06:** Calculate gross profit and margin percentages per line item from buying costs and customer rate cards.
- [ ] **Task 07:** Permanently freeze agreed unit prices onto Pick Lists and Acknowledgement Receipts upon document creation.
- [ ] **Task 08:** Enforce supervisor sign-off and justification notes whenever a selling price violates minimum gross margin thresholds.
- [ ] **Task 09:** Mask profit margins and purchase costs from warehouse floor roles while showing them to finance and administrators.

---

## 3. Data Imports & Batch Excel/CSV Processing

- [ ] **Task 10:** Build bulk Excel/CSV import for the item catalog with dimension ($L \times W \times H$), flow type (`vmi`, `trading`, `supplies`), and reorder threshold validation.
- [ ] **Task 11:** Build bulk Excel/CSV import for warehouse zones, aisles, racks, shelf levels, and bin capacities.
- [ ] **Task 12:** Build bulk Excel/CSV import for supplier and customer master data, TINs, addresses, and payment terms.
- [ ] **Task 13:** Implement automated parsing of supplier Commercial Invoices and Packing Lists (CI/PL) into draft Receiving Reports (WRRs).
- [ ] **Task 14:** Implement automated parsing of customer Release Advices (DRA / WRF) into draft Pick Lists.
- [ ] **Task 15:** Add an import staging preview table with real-time error highlighting for duplicates, invalid entities, and missing required fields.

---

## 4. Automated PDF Generation & Documents Center

- [ ] **Task 16:** Generate server-side, print-ready Warehouse Receiving Report (WRR) PDFs with QR codes, inspection remarks, and signature blocks.
- [ ] **Task 17:** Generate server-side Pick List PDFs sorted by warehouse rack path with FIFO lot allocation and scannable barcodes.
- [ ] **Task 18:** Generate server-side Acknowledgement Receipt (AR) and Delivery Receipt (DR) PDFs with frozen pricing and turnover signatures.
- [ ] **Task 19:** Generate printable Daily Inspection and Discrepancy Sheets for aging stock and Return-to-Vendor (RTV) routings.
- [ ] **Task 20:** Generate official Statement of Account (SOA) PDFs detailing daily storage, handling charges, and tax summaries.
- [ ] **Task 21:** Generate exportable PDF and Excel Lot History and Traceability audit reports from intake to release.
- [ ] **Task 22:** Wire the View, Download, and Print buttons in the Documents Center (`/documents`) to the live PDF generation pipeline.

---

## 5. Master Inventory, Dashboard & Reporting Hub

- [ ] **Task 23:** Display real-time inventory aging categorized into 0–30, 31–60, 61–90, and 90+ day brackets based strictly on lot arrival dates.
- [ ] **Task 24:** Dynamically toggle item labels between Supplier Item Codes for VMI and DSGC Item Numbers for Trading items.
- [ ] **Task 25:** Configure automated visual alerts for inventory items falling below safety reorder thresholds.
- [ ] **Task 26:** Enable a one-click action on aging inventory to initiate stock transfers into inspection hold.
- [ ] **Task 27:** Calculate live warehouse throughput metrics comparing inbound vs. outbound volume over time.
- [ ] **Task 28:** Build role-guarded inventory valuation and realized gross profit KPI reports for finance users.
- [ ] **Task 29:** Calculate and display delivery performance and SLA dispatch fulfillment percentages.
- [ ] **Task 30:** Implement universal one-click Excel and CSV data exports across all dashboard and report tables.

---

## 6. Settings, Administration & Audit Logging

- [ ] **Task 31:** Build user account creation and role-based access assignment for floor operators, supervisors, billing, and admins.
- [ ] **Task 32:** Implement race-condition-safe, sequential document numbering (e.g., `WRR-2026-00001`, `PL-2026-00001`, `SOA-2026-00001`).
- [ ] **Task 33:** Create back-office settings for default reject zones, aging threshold limits, and PDF company header details.
- [ ] **Task 34:** Construct an immutable audit log viewer capturing all user mutations, prior states, updated values, user IDs, and timestamps.

---

## 7. End-to-End Workflow Verification & Deployment

- [ ] **Task 35:** Execute an end-to-end integration test validating the workflow from CI/PL import $\rightarrow$ Receiving $\rightarrow$ Putaway $\rightarrow$ Master Inventory $\rightarrow$ FIFO Picking $\rightarrow$ Dispatch $\rightarrow$ Monthly SOA Billing.
