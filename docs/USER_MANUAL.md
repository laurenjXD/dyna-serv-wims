# Dyna-Serv WIMS — Official User Manual & Operations Guide

Welcome to the **Dyna-Serv Warehouse Inventory Management System (WIMS)** user manual and standard operating procedure documentation.

---

## 📚 Table of Contents

1. **[Inventory Models, Stock Balance & Withdrawal Rules](./user-manual/inventory-and-withdrawals.md)**
   - Inventory Calculation Formula: $\text{Total Quantity} = \text{Boxes} \times \text{SPQ}$
   - Trading vs. VMI vs. Supplies (Core Rules & SPQ Enforcement)
   - Commercial Outbound (Two-Stage Commitment) vs. Fast Supplies Withdrawal
   - Master Inventory Item View Modal & Daily Movement Trail Audit

2. **Incoming Receiving & WRR Processing**
   - Inbound WRR Generation (CIPL Pre-Alert Matching & Manual Entry)
   - Barcode Generation & QR Carton Labeling
   - Putaway Allocation & Staging Bin Management

3. **Outgoing Picking, Logistics & Dispatch**
   - Delivery Release Advice (DRA) Automated Parsing
   - FIFO/FEFO Staging & Override Approvals
   - QR Scanning Verification at Dispatch Gate
   - Delivery Receipt (DR) & Priced Acknowledgement Receipt (AR) Generation

4. **Master Data & Organization Hierarchy**
   - Organization Enrollment & Role Auto-Assignment (Customer, Vendor, Supplier, Internal)
   - Item Master Enrollment, SPQ Definitions & On-the-Fly Category/Subcategory Management
