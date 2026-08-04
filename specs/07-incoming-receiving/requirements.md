# 07 - Incoming / Receiving — Requirements
Status: Draft
Depends on: specs/01-core-data-model/

## 1. Overview
This module governs the arrival, inspection, and system enrollment of incoming stock via the Warehouse Receiving Report (WRR) and the generated Incoming Ledger.

## 2. User Stories

### Incoming Ledger Audit Trail
- **WHEN** a user visits the Incoming/Receiving page, **THE SYSTEM SHALL** provide an Incoming Ledger tab/view that queries `inventory_transactions` where `movement_type` is `receiving` or `putaway`, **SO THAT** staff can view a complete chronological audit trail of all items received, including the date, time, WRR document reference, CIPL reference, supplier, receiving user, item code, and quantity received.
