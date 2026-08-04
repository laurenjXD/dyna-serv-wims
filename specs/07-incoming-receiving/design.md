# 07 - Incoming / Receiving — Design
Status: Draft
Depends on: specs/01-core-data-model/

## 1. UI & Ledger Workflows

### Incoming Ledger Interface
The Incoming Ledger serves as the central audit trail for all inbound inventory movements. Rather than a separate database table, it acts as a structured, filtered view of the master `inventory_transactions` table.

- **Data Source**: `inventory_transactions` filtered by `movement_type IN ('receiving', 'putaway')`.
- **Primary Table Columns**:
  - **Date/Time**: Timestamp of the transaction.
  - **Item Code**: The unified SKU/Item Code (prioritized first).
  - **Item Description**: Name/Description.
  - **Lot Number**: System generated Lot # and Vendor Lot #.
  - **Qty Received**: Number of pieces/boxes received.
  - **UOM**: Unit of Measure.
  - **WRR Number**: The Warehouse Receiving Report document reference (`wrr_id`).
  - **Supplier**: The originating vendor.
  - **Receiving User**: The staff member who confirmed the scan.

### Interaction & Drill-Down
- **Row Click / Modal**: Clicking any ledger row opens an **Incoming Detail Modal**.
- **Modal Data**:
  - Exact storage location/bin assigned during putaway.
  - Inspection conformance status and any logged TDC/defect remarks.

### Search & Filtering
The Incoming Ledger MUST provide the following search and filtering controls:
- **Date Range**: Filter transactions by a specific start and end date.
- **Vendor Filter**: Filter receipts by specific suppliers.
- **Flow Filter**: Filter by `vmi`, `trading`, or `supplies`.
- **Global Search**: Search by Item Code, Part Number, or WRR Number.
