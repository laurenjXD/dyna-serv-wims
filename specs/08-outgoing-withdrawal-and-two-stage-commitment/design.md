# 08 - Outgoing Withdrawal & Two-Stage Commitment — Design
Status: Draft
Depends on: specs/01-core-data-model/

## 1. UI & Ledger Workflows

### Outgoing Ledger Interface
The Outgoing Ledger serves as the central audit trail for all outbound inventory movements. It is a strictly filtered view of the master `inventory_transactions` table.

- **Data Source**: `inventory_transactions` filtered by `movement_type IN ('pick', 'transfer')`.
- **Primary Table Columns**:
  - **Date/Time**: Timestamp of the transaction.
  - **Item Code**: The unified SKU/Item Code (prioritized first).
  - **Item Description**: Name/Description.
  - **Lot Number**: The specific FIFO-sequenced lot picked.
  - **Qty Withdrawn**: Number of pieces/boxes removed.
  - **UOM**: Unit of Measure.
  - **Pick List Number**: Document reference driving the withdrawal.
  - **Customer / Destination**: The receiving party or destination.
  - **Dispatching User**: The staff member who executed the outbound scan.

### Interaction & Drill-Down
- **Row Click / Modal**: Clicking any ledger row opens an **Outgoing Detail Modal**.
- **Modal Data**:
  - Exact storage location picked from.
  - Approval Queue Reference ID (if a FIFO override was requested and approved for this pick).
  - Acknowledgement Receipt pricing details (depending on tenant visibility).

### Search & Filtering
The Outgoing Ledger MUST provide the following search and filtering controls:
- **Date Range**: Filter transactions by a specific start and end date.
- **Vendor/Customer Filter**: Filter by specific customers or receiving parties.
- **Flow Filter**: Filter by `vmi`, `trading`, or `supplies`.
- **Global Search**: Search by Item Code, Part Number, or Pick List Number.
