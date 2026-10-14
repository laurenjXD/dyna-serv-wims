# Dyna-Serv WIMS — Official User Manual & Operations Guide

Welcome to the **Dyna-Serv Warehouse Inventory Management System (WIMS)** user manual and standard operating procedure documentation.

---

## 📚 Complete Operations Manual

### 1. [Inventory Models, Stock Balance & Withdrawal Rules](./user-manual/inventory-and-withdrawals.md)
* Physical balance equation: $\text{Total Quantity} = \text{Boxes On Hand} \times \text{SPQ}$
* Trading vs. VMI vs. Supplies (Core rules, SPQ carton enforcement vs. loose pieces)
* Commercial Outbound (Two-Stage Commitment) vs. Fast Supplies Withdrawal
* Master Inventory Item View Modal & Daily Movement Trail Audit

### 2. [Incoming Receiving & WRR Processing](./user-manual/incoming-receiving-and-wrr.md)
* Inbound WRR Generation (CIPL Pre-Alert Matching & Manual Entry)
* Barcode Generation & QR Carton Label Printing
* Floor Receiving, QR Verification Scan & Disposition (Store vs. Inspect)
* Putaway Allocation & Master Inventory Commitment

### 3. [Outgoing Picking, Logistics & Dispatch](./user-manual/outgoing-picking-and-dispatch.md)
* Delivery Release Advice (DRA) Automated Parsing (Excel & PDF)
* Two-Stage Safety Commitment (Stage 1 Allocation $\rightarrow$ Stage 2 Dispatch Scan)
* FIFO/FEFO Staging & Override Approvals
* QR Scanning Verification at Dispatch Gate
* Delivery Receipt (DR) & Priced Acknowledgement Receipt (AR) Generation

### 4. [Master Data & Organization Hierarchy](./user-manual/master-data-and-organizations.md)
* Organization Enrollment & Role Auto-Assignment (Customer, Vendor, Supplier, Internal)
* Item Master Enrollment, SPQ Definitions & Dimension Specifications
* On-the-Fly Category & Subcategory Creation and Inline Editing
* Financial Pricing (Unit/Box Buying & Selling Rates, Margin Calculation)

### 5. [Warehouse Document Printing, Signatures & Compliance](./user-manual/document-printing-and-compliance.md)
* Standardized 3-Tier Accountability Signatures (`Floor Staff/Receiver`, `QC Inspector/Lead`, `Warehouse Supervisor Approval`)
* Print CSS Page-Break Protection (`page-break-inside: avoid !important`)
* Document Reprint Watermark Security (`REPRINT — [Timestamp]` at 20% opacity) & Audit Trail
* Pricing Model Treatment & Confidentiality Notices (Trading Final vs. VMI Reference)
* Permanent Tiered Document Retention Policy (3 Years Hot in Supabase $\rightarrow$ Secure Cold Archive)

### 6. [Edge Cases, Error Handling & System Exception Guide](./user-manual/edge-cases-and-troubleshooting.md)
* The 3-Component Error Feedback Standard (**What happened**, **Why it failed**, **Next Action / Solution**)
* Inbound Receiving Edge Cases (WRR header QR mis-scan, advance notice unconfirmed, visual damage splits, OS&D shortages, capacity allocation splits, and commit idempotency)
* Storage & Quality Control Edge Cases (quarantined lot pick prevention, inspection split dispositions, rack capacity overfill)
* Outbound Withdrawal Edge Cases (provisional item code gate, FIFO/FEFO override approvals, stock reservation races)
* Physical Picking & Dispatch Gate Edge Cases (premature dispatch prevention, rack shortages, shared QR disambiguation, 24h commitment TTL expiry, concurrent dispatch row locks & CAS checks, and non-fatal PDF generation recovery)

