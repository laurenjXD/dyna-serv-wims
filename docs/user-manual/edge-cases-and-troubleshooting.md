# Dyna-Serv WIMS — Edge Cases & Troubleshooting Companion Guide

**Canonical manual:** [Unified User Manual](../USER_MANUAL.md)  
**Status:** Companion chapter; reconcile with the unified manual whenever workflow rules change.  
**Last reconciled:** 2026-10-27

## Chapter: Edge Cases, Error Handling & System Exception Guide

---

### 1. The 3-Component Error Feedback Standard

All user-facing exceptions on floor screens and office dashboards strictly present **3-Component Error Feedback**:

```text
┌────────────────────────────────────────────────────────┐
│ 1. WHAT HAPPENED: Plain-language description of event  │
│ 2. WHY IT FAILED: Underlying system cause or rule      │
│ 3. NEXT ACTION:   Clear, actionable resolution step    │
└────────────────────────────────────────────────────────┘
```

Never ignore an error modal or attempt repeated random scanning without consulting the instructions below.

---

### 2. Inbound Receiving Edge Cases & SOPs

#### Scenario 2.1: WRR Document Header Barcode Scanned
* **What Happened**: Scanner beeped with error: `"WRR Document Header Barcode Scanned"`.
* **Why It Failed**: The operator pointed the handheld scanner at the barcode in the paper WRR header (`WRR-YYYY-NNNNNN`), which identifies the document, not a physical carton or pallet.
* **Next Action**: Aim the scanner at the QR label affixed to the actual physical carton or pallet.

#### Scenario 2.2: Unknown / Unregistered Item Barcode
* **What Happened**: Scanner returned `"Unknown Item Barcode"`.
* **Why It Failed**: The scanned barcode does not map to any active item in the master catalog.
* **Next Action**: The floor screen pauses. Silent or offline item creation is forbidden. An administrator or catalog lead must enroll the item online via **Master Data** $\rightarrow$ **Item Enrollment** (`06-party-and-item-enrollment`). Once enrolled, the operator must re-scan the carton.

#### Scenario 2.3: Inventory Model Mismatch
* **What Happened**: Scan rejected with `"Inventory Model Mismatch"`.
* **Why It Failed**: The physical item’s enrolled model (`Trading`, `VMI`, or `Supplies`) does not match the active WRR’s model. (e.g., scanning a Trading item during a VMI intake).
* **Next Action**: Verify the physical shipment against the packing list. If the item was shipped under the wrong commercial flow, set it aside for supervisor review. Do not attempt to force the intake.

#### Scenario 2.4: Supplier Advance Notice Not Confirmed
* **What Happened**: Scanning a supplier label `WAN:<uuid>` produces an `"Unmatched Advance Notice"` exception.
* **Why It Failed**: The vendor submitted a pre-arrival label through the Organization Portal, but the back-office team has not yet reviewed and confirmed it against the final CIPL.
* **Next Action**: Notify the back-office receiving coordinator to open the WRR Work Queue and confirm the pending advance notice. (Note: Self-review by an internal user holding a counterparty account is blocked by the system).

#### Scenario 2.5: Damaged Goods on Pallet (Visual Damage Split)
* **What Happened**: A pallet of 10 boxes contains 8 intact boxes and 2 visibly crushed or wet boxes.
* **Why It Failed**: Barcodes scan successfully, but goods fail physical visual inspection.
* **Next Action**:
  1. In Step 2 of the placement flow, assign the 8 good boxes to their storage racks.
  2. Assign the 2 damaged boxes to **`Inspection Bay / Hold`** or mark as `reject`.
  3. Enter mandatory remarks and defect reasons. Good boxes are committed to available inventory, while damaged boxes route to the quarantine/reject location, automatically triggering an RTV (Return to Vendor) workflow.

#### Scenario 2.6: Delivery Shortage / Missing Cartons (OS&D Resolution)
* **What Happened**: The CIPL declared 10 cartons, but only 9 cartons physically arrived.
* **Why It Failed**: Supplier under-shipped.
* **Next Action**:
  1. Scan one valid QR to identify the line.
  2. In the box placement selector, assign the 9 present boxes to their storage locations.
  3. Mark the 10th box as **`Missing`** (Unassigned).
  4. Complete the presence attestation and commit the line. Only the 9 present boxes post to inventory.
  5. If the missing box cannot be located, a supervisor selects **Finalize with Shortage (OS&D)**. The WRR transitions to `confirmed` with an official shortage summary. The system does not create a pseudo `partial` status.

#### Scenario 2.7: Storage Location Full (Capacity Split)
* **What Happened**: Suggested rack cannot fit all 10 incoming cartons.
* **Why It Failed**: The remaining volumetric CBM capacity of the rack is less than the total CBM required.
* **Next Action**: The UI displays all active storage racks with available remaining CBM. Staff split the line: e.g., assign Box 1–6 to Rack A-01 and Box 7–10 to Rack B-04. Tapping **Store** commits the line atomically, generating multiple balance rows for the same lot without splitting the lot identity.

#### Scenario 2.8: Network Drop or Double-Click on Commit
* **What Happened**: Network lag during the "Store" action causes a duplicate request.
* **Why It Failed**: Repeated HTTP submission.
* **Next Action**: Safe to retry. The database uses an atomic conditional claim (`UPDATE ... WHERE committed_at IS NULL`). Retries detect that `committed_at` is already populated and return immediate success without duplicating stock or ledger transactions.

---

### 3. Storage, Transfer & Quarantine Edge Cases

#### Scenario 3.1: Quarantined Lot Selected for Pick List
* **What Happened**: A lot physically sitting in the warehouse cannot be selected when drafting a pick list.
* **Why It Failed**: The lot status is `quarantined` (held for inbound inspection or daily aging check).
* **Next Action**: Quarantined lots have zero available stock (`qty_available = 0`). Quality inspectors must resolve the inspection case in `/inspection`. Once passed, the stock is transferred to a standard storage rack, updating status to `available`.

#### Scenario 3.2: Partial Pass / Partial Fail on Inspection
* **What Happened**: Inspector reviews 10 quarantined units; 7 pass and 3 fail.
* **Why It Failed**: Mixed quality batch.
* **Next Action**: Use the split disposition tool in `/inspection`. Enter 7 as `return_to_stock` and 3 as `reject`. The system strictly validates that `split_sum === inspected_qty`. The 7 good units return to storage racks; the 3 rejected units route to rejects holding.

---

### 4. Outbound Withdrawal & Allocation Edge Cases

#### Scenario 4.1: Provisional Item Code Block (Missing PO / DSGC Code)
* **What Happened**: Pick-list generation blocked with: `"Provisional Item Code Detected"`.
* **Why It Failed**: One of the items has no formal Purchase Order or DSGC item number assigned (`items.dsgc_item_number IS NULL` for Trading/Supplies or `supplier_item_code IS NULL` for VMI). Generating the pick list would permanently bake an internal temporary code into a legally binding, priced commercial document.
* **Next Action**: The entire draft is safely blocked. Complete the DSGC number assignment in the Item Master before regenerating the pick list.

#### Scenario 4.2: Requesting Pallet Out of FIFO/FEFO Sequence
* **What Happened**: Operator attempts to pick a specific pallet rather than the recommended FIFO/FEFO batch.
* **Why It Failed**: WIMS strictly protects inventory freshness and contract terms.
* **Next Action**: Selecting **Choose another pallet** requires entering a mandatory operational reason. This automatically routes an override request to **Approval Queue** (`09-approval-queue`). The pick list cannot be generated until a supervisor approves the request. The approved override is single-use and non-transferable. Self-approval is strictly prevented.

#### Scenario 4.3: Stock Race Between Concurrent Planners
* **What Happened**: Two operators attempt to allocate the last remaining 10 boxes of an item simultaneously.
* **Why It Failed**: Available inventory was claimed by the first transaction to commit.
* **Next Action**: The second transaction detects that `qty_available` is insufficient and aborts safely. The second operator is prompted to refresh the view and allocate alternative eligible lots.

---

### 5. Physical Picking & Dispatch Confirmation Edge Cases

#### Scenario 5.1: Attempting Dispatch Before Physical Pick
* **What Happened**: Dispatch gate scanner rejects the pick list with `"Pick Not Completed"`.
* **Why It Failed**: The pick list is still in `allocated` status in the **To Pick** queue.
* **Next Action**: The warehouse floor team must physically retrieve the items using the pick-list PDF, stage them at the loading dock, and click **Mark as Picked**. This advances the document to `picked` in the **To Dispatch** queue.

#### Scenario 5.2: Discrepancy Found at Rack During Picking
* **What Happened**: Pick list instructs retrieving 5 boxes from Rack C-02, but only 4 boxes are physically on the shelf.
* **Why It Failed**: Unrecorded damage, prior shrinkage, or misplaced carton.
* **Next Action**: Use **Report Location Shortage** (`reportLocationShortage`). Enter the actual found quantity (4 boxes). The system updates the pick-list line to 4 boxes. The 1 missing box is released from reservation and flagged for inventory cycle counting.

#### Scenario 5.3: Disambiguating Shared Item QRs Across Multiple Locations
* **What Happened**: Item A was picked from two different locations (3 boxes from Rack 1, 2 boxes from Rack 2). Floor staff scans a generic item QR at the dispatch gate.
* **Why It Failed**: System needs to assign boxes to the correct source location balances.
* **Next Action**: Scanning the generic item QR automatically counts toward the first incomplete line. To target a specific rack allocation directly, staff can scan the specific **Lot QR**.

#### Scenario 5.4: 24-Hour Pick-List Reservation Expiration
* **What Happened**: Dispatch fails with error: `"Commitment Expired"`.
* **Why It Failed**: Pick list sat in staged/picked state for more than 24 hours without loading onto a truck.
* **Next Action**: To prevent permanent inventory hoarding, reservations have a strict 24-hour TTL. If expired at the dispatch gate, WIMS automatically releases `qty_committed` back to available inventory and marks the commitment as `expired`. Stock never left the shelf. The operator must regenerate a fresh pick list.

#### Scenario 5.5: Incomplete Box Count at Dispatch Gate
* **What Happened**: Dispatch confirmation button remains disabled or returns `"Scan Evidence Incomplete"`.
* **Why It Failed**: The pick list requires 6 boxes, but only 5 boxes have been scanned through the gate.
* **Next Action**: Every physical box must pass the gate scanner. Locate the missing physical box and scan its label. Once all lines match `scanned_boxes === numberOfBoxes`, the confirmation button unlocks.

#### Scenario 5.6: Concurrent Dispatch of the Same Pick List
* **What Happened**: Two dispatch operators press "Confirm Dispatch" at the same moment on separate tablets.
* **Why It Failed**: Potential race condition that could double-decrement stock.
* **Next Action**: The database executes `SELECT ... FOR UPDATE` on the `pick_lists` row. The first transaction executes the decrement and marks status as `dispatched`. The second transaction waits, reads status as `dispatched`, and safely returns `already_dispatched` without double-decrementing stock.

#### Scenario 5.7: PDF Generation Service Timeout Post-Dispatch
* **What Happened**: Physical dispatch succeeds and stock is decremented, but the Delivery Receipt PDF preview hangs or displays a retry badge.
* **Why It Failed**: Temporary network timeout contacting Supabase Storage or the PDF rendering engine.
* **Next Action**: Physical inventory decrement is preserved and immutable. The document status is set to `pending` / `attention`. Navigate to `/documents` $\rightarrow$ **Delivery Receipts (DR/AR)** and click **Regenerate / Download** once connectivity is restored.
