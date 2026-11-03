# WIMS operating-guide library

**Last reconciled:** 2026-11-03

Use the [Unified User Manual](../USER_MANUAL.md) for the complete system tour. These companion guides are practical operating procedures: each explains who does the work, the required setup, the screen controls, worked cases, expected results, and recovery when the result differs.

## Choose your task

| Your task or question | Guide | What it helps you complete |
|---|---|---|
| A truck arrived; how do I receive the goods? | [Incoming receiving and WRR](incoming-receiving-and-wrr.md) | Create the correct record, verify a line, account for declared boxes, distinguish stored/held/missing stock |
| How much stock can I promise or reserve? | [Inventory and withdrawals](inventory-and-withdrawals.md) | Read physical/committed/available balances, prepare a box-based pick list, understand FIFO/FEFO and exceptions |
| Goods are reserved; how do we release them? | [Outgoing picking and dispatch](outgoing-picking-and-dispatch.md) | Pull goods, complete the actual approval checkpoint, verify location lines, confirm final stock movement |
| An Organization or material is missing/wrong | [Master data and Organizations](master-data-and-organizations.md) | Correct role-specific relationships, material assignments, packaging, and active locations |
| I need a document, QR label, or reprint | [Document printing and compliance](document-printing-and-compliance.md) | Choose the right artifact, review identity/prices, print carefully, avoid duplicate releases |
| The network dropped or sync needs attention | [Offline capture and synchronization](offline-and-sync.md) | Preserve observations, read the sync cards, retry safely, hand exceptions to a supervisor |
| A staff member needs access | [Accounts, roles, and access](accounts-roles-and-access.md) | Compare effective permissions, assign approved roles, manage custom roles and verify the result |
| A transaction failed; what next? | [Exceptions and troubleshooting](edge-cases-and-troubleshooting.md) | Check what committed, recover without duplicate stock movements, provide useful support evidence |

## Learn the complete flow

1. **Set up:** active Organization, explicit relationship, assigned material, correct packaging, permitted active location.
2. **Receive:** a WRR describes the shipment. A scan identifies a line; the operator still counts the physical boxes and confirms online Store/Hold.
3. **Review stock:** physical stock is separate from stock committed to another release. Held goods are not ordinary available stock.
4. **Prepare a release:** the Pick List commits availability without removing physical on-hand stock.
5. **Pull and review:** collect the committed cartons and complete the application's approval/checkpoint on the dispatch page.
6. **Verify and dispatch:** identify each committed location line, then explicitly confirm dispatch online. This is the outbound stock-decrement boundary.
7. **Check the evidence:** review the outgoing ledger and priced Delivery Receipt / Acknowledgement Receipt. Reprinting paper does not dispatch another shipment.

## How to use training examples

The guides use a fictional VMI item `VMI-100`, SPQ **50 pieces per box**, lot `LOT-TRAIN-01`, and an inbound declaration of **10 boxes = 500 pieces**. Locations `A1-01` and `A1-02` are examples; use the active labels offered by your deployment. These names, quantities, and document references are training examples, not instructions to create live records.

Read each case from prerequisites to final verification. A green scan message alone is not enough when the next action is online Store or Dispatch confirmation.

## Rules shared by every chapter

- There is one warehouse. Organization and Inventory Model identify business context, not additional warehouses.
- Permissions determine usable actions and records. A job title or visible button does not override server authorization.
- VMI is consignment/customer-owned stock; Trading is the trading/owned-stock workflow; Supplies is internal-use stock.
- Enter the unit named by the screen. The current multi-item draft asks for **boxes** and derives pieces from SPQ, including Supplies; do not assume a separate loose-piece quick-issue screen exists.
- A line-identifying scan does not replace physical counting or authorize changing the quantity.
- Offline observations cannot finalize putaway, create a Pick List, decide an approval, or dispatch goods.
- Pick Lists and Delivery Receipts / Acknowledgement Receipts are priced. Trading document prices are final; VMI release prices are references, with period billing calculated separately.
- Dispatch scheduling/delivery tracking remains deferred. Documentation is not evidence that a future module is live.

## Keep the references consistent

Update the unified manual and affected companions together when a workflow changes. If a label or result differs, record the route, record number, action, time, and exact message, then ask the supervisor to verify the deployed version. Use [System Documentation](../System_Documentation.md) for architecture, migration prerequisites, and support runbooks; operators should not perform database repairs.
