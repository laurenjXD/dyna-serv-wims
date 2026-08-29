# Carton-Level Traceability — Requirements

Status: Approved
Approved: 2026-08-28

## Purpose

Every physical carton must have one globally unique, never-reused Carton ID.
The Carton ID identifies the physical carton; the existing item code identifies
the product. QR and Code 128 are interchangeable transport formats and contain
the Carton ID only. Mutable owner, location, quantity, status, and transaction
data remain database fields.

## Requirements

1. The system SHALL persist a unique Carton ID for every received physical
   carton and SHALL never reuse an issued ID, including after cancellation,
   delivery, destruction, or closure.
2. A carton SHALL reference the existing item, lot, WRR line, owner party,
   supplier party, and current location where those records exist. Product
   master data SHALL NOT be duplicated into the carton record.
3. Carton lifecycle changes SHALL be append-only in an immutable history:
   expected, received, accepted, rejected, put_away, available, allocated,
   picked, dispatched, delivered, returned, damaged, lost, or cancelled.
4. Receiving SHALL resolve a scanned Carton ID before changing receiving or
   inventory state. It SHALL reject unknown, duplicate, wrong-item,
   wrong-shipment, cancelled, damaged, wrong-owner, and wrong-warehouse scans
   with a recoverable reason.
5. Receiving SHALL preserve expected, physically received, accepted, rejected,
   outstanding, and variance carton/quantity values independently. Missing
   cartons SHALL NOT create inventory; rejected cartons SHALL NOT become
   available inventory.
6. A receiving discrepancy SHALL be created when actual carton count or
   accepted quantity differs from expected quantity. Supervisors resolve the
   discrepancy with a disposition; receivers record observations only.
7. Pick-list and dispatch scan evidence SHALL reference actual Carton IDs. An
   unallocated carton SHALL NOT be picked or dispatched without an authorized
   exception.
8. Search and traceability surfaces SHALL be able to follow a carton through
   item, owner, supplier, WRR, receipt, location, pick list, dispatch, delivery,
   and future billing/POD references without mutating historical events.
9. Generated labels SHALL show the Carton ID, item code, description, quantity,
   lot, and optional owner/supplier/warehouse text, while the machine-readable
   payload remains the Carton ID.
10. Existing aggregate lot inventory and `inventory_units` behavior SHALL
    remain compatible during migration. This feature adds carton identity and
    history; it does not create a second inventory ledger.

## Out of scope for the first vertical slice

Delivery/POD and contract-specific billing events will consume the carton
history contract in their owning approved specs. They are not duplicated here.

## Sign-off

- Technical Lead: User / System, 2026-08-28
- Product/Operations Lead: User / System, 2026-08-28
