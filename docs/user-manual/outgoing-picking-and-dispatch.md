# Physical picking and dispatch ? detailed operating procedure

**Last reconciled:** 2026-11-03  
**Audience:** Authorized floor staff, dispatch users, supervisors, and administrators  
**Evidence:** Reviewed implementation and approved workflows; grants and deployment determine available actions.

[Unified User Manual](../USER_MANUAL.md) ? [Guide library](README.md) ? [System Documentation](../System_Documentation.md)

## 1. Distinguish the four checkpoints

A Pick List is a committed release plan. Goods still have to be pulled, reviewed, identified, and finally dispatched. Creating or printing the list does not release another shipment.

| Checkpoint | Operator's work | Inventory consequence |
|---|---|---|
| Allocated list | Review and pull the committed boxes | Availability already reserved; on hand unchanged |
| Approval/pick completion | Authorized reviewer selects **Approve Pick List for Dispatch** | List enters the application's picked/scan-ready state; no final decrement |
| Line verification | Identify each committed location line using its correct QR | Records required box-selection/scan evidence |
| Final dispatch | Explicitly confirm the handoff online | Revalidates, decrements on hand, releases the executed reservation, records outgoing transaction |

The current `/pick-lists/[pickListId]/pick` route redirects to `/pick-lists/[pickListId]/dispatch`. There is not a separate barcode-picking application at the old URL. Physical picking remains a real warehouse task even though the software checkpoints share a route.

## 2. Prepare and physically pull the goods

1. Open **Master Inventory ? Pick Lists** and locate the allocated Pick List by number.
2. Use its **PDF**/**View PDF** control and compare Organization, Inventory Model, recipient, item, lot, location, boxes, and derived units against the release instruction.
3. Pull the committed goods from their exact listed locations. Compare lot and packaging, not merely a similar item description.
4. Keep groups identifiable when a material/lot is split across locations. They remain separate committed location lines.
5. Count the actual boxes and set mismatches aside for review before the handoff.
6. Select **Pick & Dispatch** to open `/pick-lists/[pickListId]/dispatch`.

Do not substitute another lot/location because the recommended goods are difficult to reach. Use the supported shortage/exception path. The physical release must agree with the commitment and any approved source exception.

## 3. Complete the actual allocated-list approval gate

While the list is **allocated**, the dispatch page explains that a **Supervisor or Administrator** must review/approve before dispatch scanning begins. Line items are locked after reservation.

1. The authorized reviewer opens the Pick List and compares the committed plan with the physical picking result.
2. When correct, that reviewer selects **Approve Pick List for Dispatch**.
3. Verify **Pick List Approved** and the scan-ready state.
4. If forbidden, stale, cancelled, or expired, return to current state and resolve the actual issue. Do not borrow another account's session.

This is the current implementation's role-gated checkpoint. General permission-driven navigation does not mean every custom role can pass this specific action. It is also distinct from FIFO override approval: a source-selection exception is not proof that physical goods were dispatched.

## 4. Verify each committed location line

Read the active line's item, lot, location, committed boxes, and progress. Use **Scan item or lot QR (or enter carton barcode)...**, handheld input, or the provided camera control.

The confirmed workflow is **one matching carton/item/lot QR identifies a jackwrapped committed line and confirms its remaining committed box quantity**. Repeatedly scanning one shared item label once per box is not the required procedure.

1. Confirm the physical group really contains the committed boxes at that line's location.
2. Scan a permitted matching label.
3. Read the identified line and accepted quantity. The server resolves the QR; the label and committed context must agree.
4. Verify progress reaches the required quantity for that line.
5. Continue with each unfinished committed location line until all are complete.

A unique carton identity resolves its own lot/location. Offline replay also checks its captured target line before mutation. A generic item QR that matches several unfinished lines follows the server's matching order. Use a precise permitted lot/carton label when necessary to distinguish groups and always read which line was accepted.

A duplicate rejection after completion means check progress and continue to an unfinished line. Do not reset the record or create another Pick List merely to accept the same label again.

## 5. Worked case: five boxes from two locations

**Fictional case:** `VMI-100`, SPQ 50, is committed as two boxes from `A1-01` and three from `A1-02` for one permitted recipient.

1. Pull the two boxes from the first location and the three from the second.
2. Keep those groups identifiable: total five boxes = 250 pieces.
3. Complete the authorized allocated-list checkpoint.
4. Identify the first line with a matching QR; verify two boxes confirmed for that location line.
5. Identify the second line separately; verify three boxes confirmed there.
6. Check the completed-line summary. One accepted scan is not enough merely because both lines share an item code.
7. Confirm final dispatch online and verify the resulting outgoing status/ledger entry.

If on hand was 500 pieces with only this list committing 250, successful dispatch leaves 250 pieces on hand and releases this executed 250-piece commitment. Other active transactions can affect real totals. A retry of the same completed dispatch must not become a second movement.

## 6. Confirm final dispatch and the document handoff

1. Review all lines, quantities, recipient, and physical goods.
2. Confirm live connectivity and any configured warehouse-network requirement.
3. Use the page's final dispatch confirmation control once.
4. Wait for the result; success returns the operator to the outgoing work area.
5. Find the final status/outgoing ledger transaction.
6. Open the priced Delivery Receipt / Acknowledgement Receipt when available and check reference, quantity, recipient, and price treatment before normal signing/handoff.

A document-generation delay does not necessarily mean dispatch failed. If the stock transaction committed but the artifact is pending/failed, resolve the artifact without dispatching again. See [Document printing](document-printing-and-compliance.md).

Trading document prices are final. VMI release document prices are reference values, with the period-average bill calculated separately. Pick Lists and Delivery Receipts / Acknowledgement Receipts are both priced documents.

## 7. Shortage and failure decisions

| Case | Immediate action | Required check before continuing |
|---|---|---|
| Wrong item/lot/location | Stop and isolate questionable goods | Correct physical group and label must match committed line |
| Fewer boxes found | Use the offered shortage report and true found quantity | Do not silently replace source stock or over-report quantity |
| Shortage after boxes already selected | Read the selection-related error | Resolve selection/current record with the supervisor before adjustment |
| No longer active/expired commitment | Return to queue | Obtain current authorized allocation; expired stock reservation is not dispatchable |
| Line already complete | Check progress and other unfinished lines | Continue correctly; do not create duplicate demand |
| Network restricted | Connect to approved configured network | Reopen same record and verify status before retry |
| Connection lost after confirmation | Retain Pick List reference and goods under normal control | Check final status/ledger once connected before repeating a mutation |

There is no extra pre-dispatch quality-inspection branch to invent as a bypass. Held goods/discrepancies must be resolved through their owning supported processes before release. Delivery scheduling/tracking is a separate deferred feature.

## 8. End-of-release handover

Confirm recipient/model, actual boxes for every location line, authorized checkpoint, accepted scans, successful final dispatch, and correct outgoing document. Assign an owner for any delayed artifact or unresolved discrepancy. Keep the shared device with its correct signed-in operator or sign out appropriately.

For interrupted connection, use [Offline capture and synchronization](offline-and-sync.md). For uncertain committed state, use [Exceptions and troubleshooting](edge-cases-and-troubleshooting.md).
