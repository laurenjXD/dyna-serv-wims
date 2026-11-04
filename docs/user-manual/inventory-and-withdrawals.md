# Master Inventory and pick-list preparation ? detailed operating procedure

**Last reconciled:** 2026-11-03  
**Audience:** Authorized inventory, release-preparation, and supervisory users  
**Evidence:** Reviewed implementation and approved workflow specifications; actual access depends on deployed grants.

[Unified User Manual](../USER_MANUAL.md) ? [Guide library](README.md) ? [System Documentation](../System_Documentation.md)

## 1. Understand the quantity before promising stock

Master Inventory at `/inventory` is the starting point for stock review, release preparation, inspection/count work, and traceability. Physical stock, reserved stock, and available stock are different.

| Quantity | Meaning | Example before dispatch |
|---|---|---|
| Physical/on hand | Goods still recorded at the location | 500 pieces remain physically on hand |
| Committed/reserved | Part promised by active Pick Lists | 150 pieces reserved for an earlier release |
| Available | Eligible physical quantity not committed elsewhere | 350 pieces available for another release |
| Held/quarantined | Physically present goods under restriction | Not ordinary available release stock |

For eligible stock, **available = on hand ? committed**. Status restrictions still matter: this arithmetic does not make a held lot selectable. A report's total is not permission to reserve all of it.

## 2. Boxes, pieces, and SPQ

SPQ is the enrolled number of base units per box. The current multi-item draft asks for **Qty (Boxes)** and derives **Qty (Units)**.

| Entered boxes | Enrolled SPQ | Derived quantity |
|---|---|---|
| 3 | 50 pieces/box | 150 pieces |
| 10 | 50 pieces/box | 500 pieces |
| 2 | 100 pieces/box | 200 pieces |

If a request says 150 pieces and SPQ is 50, enter **3 boxes**. Entering 150 in the boxes field asks for 7,500 pieces. Do not multiply twice or use a fractional box to disguise an incompatible request.

This draft uses box-based entry for **VMI, Trading, and Supplies**. It does not provide the previously described loose-piece Supplies quick-issue form or a separate internal issue slip. If an internal request cannot be expressed by the current screen, ask the supervisor for the approved supported process; do not alter SPQ solely to make it pass.

## 3. Find and review the stock

1. Open **Master Inventory** and the stock/lot view available to your account.
2. Search a distinctive item code/name. Use Organization and Inventory Model filters where offered.
3. Open the matching item and compare code, description, UOM/SPQ, Organization, lot, location, and available quantity.
4. Review expiry/received order and held/inspection status. Perishable stock follows FEFO; non-perishable stock follows FIFO under the server's authoritative ordering.
5. Use lot/location breakdown and movement history to explain a balance. A transfer changes placement; a commitment changes availability; dispatch changes physical stock.

Historical material can remain visible even when it cannot create a new release. Missing required enrolled codes, inactive status, held stock, stale/expired commitments, and unauthorized relationships can block a command.

## 4. Prepare a Pick List

Open **Master Inventory ? Pick Lists** at `/inventory?tab=pick-lists`; choose the visible **Create Pick List Draft** action where offered. Multiple materials can share one draft, but its Organization/model context must remain consistent.

### 4.1 Complete the controlling context

1. Select the **Organization** linked to the stock.
2. Confirm its displayed/inherited **Inventory Model**.
3. Complete the required recipient selection.

| Model | Release context | Frequent mistake |
|---|---|---|
| VMI | VMI Customer/stock owner plus **End Customer / Recipient** | Owner selected, actual recipient blank |
| Trading | Eligible Trading Customer recipient for Trading stock | Using a supplier or VMI End Customer as the Trading customer |
| Supplies | Eligible Internal Supplies context | Using an unrelated customer because internal setup is absent |

The starter line stays disabled until the required context is complete. **Add item line** becomes usable afterward. Changing a controlling selection clears invalid dependent data; review the rebuilt draft before continuing.

### 4.2 Select materials and quantities

1. Use **Search item code**. Compare enrolled code, description, SPQ, UOM, and available boxes in the recommendation.
2. Select the exact material. **Needs item code** means it is visible but cannot generate a Pick List until the required enrolled supplier/DSGC code is repaired.
3. Enter **Qty (Boxes)** and check the derived **Qty (Units)** immediately.
4. Review source locations, available boxes, lot, and manufacture-date information.
5. Enter **Customer PN** only when a customer part-number snapshot is needed. It is optional; leaving it blank is permitted.
6. Add further materials if needed. Do not duplicate demand or use extra rows to bypass availability.

### 4.3 Review the source plan

Default allocation follows FIFO/FEFO. If the first source cannot cover the request, the prepared flow allocates the remainder from subsequent valid sources. Review each location's allocated boxes. In manual split mode, **Add another location?** and the per-location inputs let you distribute the line, but the sum must equal the requested boxes.

**Use fixed location** changes source-selection mode. A fixed location needs enough stock for the requested boxes; an out-of-sequence choice requires approval. Normal FIFO allocation across two locations does not require an override just because a second source appears. The server rechecks live availability and the plan when generating the list.

### 4.4 Generate and verify

1. Ensure every material has its required enrolled code, positive whole-box quantity, sufficient eligible stock, and complete allocation.
2. Select **Generate Pick List** while online.
3. Wait for the result. If the response is uncertain, find the existing record before creating another request.
4. Verify Pick List number, model, recipient, material/lot/location lines, quantities, and document prices.
5. Confirm that it appears in the allocated/committed queue.

**Result:** availability is reserved, but on-hand stock is not yet decremented. Proceed to [Physical picking and dispatch](outgoing-picking-and-dispatch.md).

## 5. Worked FIFO case

**Fictional case:** `VMI-100`, SPQ 50, has two eligible FIFO sources: `A1-01` has two boxes; the next location `A1-02` has eight. The recipient requests five boxes.

1. Select the VMI owner and its End Customer/Recipient.
2. Select `VMI-100` and enter **5 boxes**.
3. Verify **250 pieces** in the derived quantity.
4. Review **2 boxes from A1-01 + 3 from A1-02 = 5 boxes**.
5. Confirm the full **5 / 5 boxes** is allocated, then generate online.

If the item had 500 pieces on hand and no other commitment, it remains 500 on hand and becomes 250 committed/250 available. After this exact release is successfully dispatched, it becomes 250 on hand and the executed 250-piece commitment is released. Other live transactions can change actual totals.

## 6. Request a genuine FIFO/FEFO exception

1. Select the actual alternate source and confirm available stock.
2. Read **FIFO/FEFO override required** and verify the precise lot/location/quantity.
3. Enter **Reason for FIFO override** with at least 10 meaningful characters. Explain the operational need, not a filler phrase.
4. Select **Request Approval** when enabled.
5. Wait for an authorized independent reviewer. Pending or rejected approval is not authority to release.
6. Refresh before proceeding. Changed quantity/source/recipient, stale state, or expired approval requires revalidation.

The draft supports **one alternate location per approval request**. An out-of-sequence split with multiple locations is not represented by one supported request; the screen explains the limitation and leaves it disabled. Do not request one source while physically using a different multi-source plan.

## 7. DRA import

Use **Import DRA (Excel/PDF)** when the document is supported. Review requesting Organization, recipient, item matches, quantity units, and all review/shortage messages. Parsing does not reserve live stock by itself.

Repeated demand for one material can be consolidated. Compare combined quantity against the original document; do not manually add rows already mapped successfully. Unmatched, ambiguous, insufficient, or provisional materials need review rather than a guessed match.

## 8. Audit, stock count, and inspection

Item detail separates enrolled specifications, live stock/lots, and movement history. Use its filters to identify the event behind a difference. Record the lot, location, source document, timestamp, and actor when escalating.

**Stock Count & Reconciliation** is separate from receiving and opening-stock migration. Select a location; review its overview and active session; start the count; enter the true physical quantity (including zero); submit; review variance/recount requirements; obtain the authorized decision. Only approved reconciliation posts a change. Do not create a false receipt/dispatch to force a balance to match a count.

Held goods require the owning inspection decision and movement before ordinary availability returns. Use Master Inventory's inspection area. Legacy `/inspection` and `/transfers` paths are not separate new destinations to teach as a parallel workflow.

## 9. Blockers and recovery

| Blocker | Check | Safe next action |
|---|---|---|
| Starter line disabled | Organization/model/recipient | Complete the controlling context |
| Code warning | Required supplier/DSGC code | Correct actual material enrollment, then refresh |
| Allocated total below requested | Manual split and eligible whole-box stock | Complete a valid allocation or reduce demand |
| Source changed after preview | Other reservations/stock movements | Refresh and rebuild; live server state is authoritative |
| Override disabled | Reason length and single-alternate-location boundary | Complete the supported exact request |
| Blank Customer PN | Whether the source actually supplied one | Leave it blank when absent; never invent a code |
| Expired/cancelled list | Current commitment status | Return to the queue and obtain a current valid allocation |

Continue with [Dispatch](outgoing-picking-and-dispatch.md) or [Troubleshooting](edge-cases-and-troubleshooting.md) as needed. For interrupted connectivity, verify committed state before retrying.
