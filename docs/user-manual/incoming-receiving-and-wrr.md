# Incoming receiving and WRR ? detailed operating procedure

**Last reconciled:** 2026-11-03  
**Audience:** Authorized receiving, floor, and supervisory users  
**Evidence:** Reviewed implementation and approved workflow specifications; availability depends on the deployed version and grants.

[Unified User Manual](../USER_MANUAL.md) ? [Guide library](README.md) ? [System Documentation](../System_Documentation.md)

## 1. What receiving does, and what you need

Receiving turns a declared shipment into a verified warehouse receipt. Creating a staged WRR is not the same as receiving stock. A scan identifies what is being handled; the online Store/Hold confirmation records its physical receipt and locations.

| Responsibility | Typical user | Preparation |
|---|---|---|
| Create a staged WRR | Authorized receiving/office user | Source CIPL/packing list, correct Organization relationship, assigned materials, correct quantity/SPQ |
| Verify and allocate present boxes | Authorized floor operator | Active receiving record, readable identifiers, physical count, permitted storage/inspection locations |
| Resolve quality/shortage exceptions | Authorized supervisor/inspector | Current record, evidence of the difference, appropriate resolution capability |

Count what actually arrived. If the source declares 10 boxes of 50 pieces, the base quantity is 500 pieces. Do not change SPQ or the source Organization just to make the form accept an incorrect declaration. Missing access must be resolved by an administrator, not by using a colleague's session.

## 2. Select Organization before the Inventory Model

Open **Receiving ? New WRR** at `/receiving/new`. Search **Organization** for the company named on the incoming document. **Inventory Model** is inherited from its valid receiving relationship; this form does not offer an unrestricted model override.

| Context | Correct source relationship | Check before continuing |
|---|---|---|
| VMI consignment | VMI Customer | It is the stock-owning customer; material belongs to the intended source |
| Trading purchase | Supplier authorized for Trading | It is the real source, not an outbound Trading Customer or End Customer |
| Internal supplies | Internal Supplies Organization | The role explicitly supports the Supplies context |

The current WRR contract requires exactly one valid inbound model for the selected source. If the company has conflicting/multiple inbound models or none, the form blocks rather than asking the operator to guess. Have the authorized master-data owner correct the setup. Do not remove a legitimate business relationship without review merely to bypass the error.

New WRR materials must be assigned to the source Organization. Imported/unassigned materials need the correct assignment in enrollment before receipt creation. An End Customer identifies a later recipient, not the source of a VMI receipt.

## 3. Create a staged WRR manually

1. Open `/receiving/new` while connected.
2. Select the source **Organization** and read its relationship and inherited model.
3. Enter **Commercial Invoice No.**, **IP Number**, and **MAWB/MBL Number** where relevant and available. These references do not replace Organization or material identity.
4. Add material lines using item search. Compare code and description, not merely a similar name.
5. Enter lot and declared quantity/packaging fields. Check the unit named by the control and the calculated carton/base-unit result.
6. Compare every row against the source document: wrong lots, duplicate demand, wrong material, non-integral carton counts, and incorrect SPQ must be corrected before submission.
7. Select **Create Staged WRR** once. The button changes to **Creating WRR?** during submission; **Reconnect to create WRR** indicates the offline restriction.
8. On the resulting detail page, verify WRR number, Organization, model, shipment references, and lines.

**Expected result:** a staged receiving record exists; no physical stock was added simply by staging. Keep its number with the shipment so the floor operator opens the same record.

If the response times out, reopen the list or known WRR before creating another draft. Repeating the same draft identity is a retry; making a new draft creates a different identity and can duplicate the business record.

## 4. Use a CIPL import without trusting the parser blindly

1. Select **Auto-Parse Excel / PDF CIPL** and choose a supported source file in the dialog.
2. Keep the original document available and review the parsed Organization and each material mapping.
3. Resolve unmatched/ambiguous references. A free-text name must not silently become a different enrolled record.
4. Verify lot, quantity, UOM, SPQ, and dimensions when supplied. Ten boxes at SPQ 50 must represent 500 pieces, not 10 pieces.
5. Review the populated WRR form and stage it only when the source and mapping agree.

An import preview does not receive goods. If parsing fails, use the supported review/correction path or enter verified source values manually; never select the nearest search result merely to proceed.

## 5. Start the floor operation and identify the line

1. Open `/receiving/[wrrId]` and verify the record's current status.
2. Select **Start Receiving** when available. The floor route is `/receiving/[wrrId]/receive`.
3. Confirm the WRR number before scanning. The right item on the wrong shipment is still wrong.
4. Use **Scan carton or item barcode to verify**, the handheld scanner, a permitted manual entry, or the offered camera control.
5. For a normal **Store** line, one matching QR identifies and confirms the remaining declared cartons for that line's placement step.
6. Compare the identified item, lot, declared boxes, and progress with the physical group. The scan is not the Store confirmation.

Inspection-disposition evidence is handled separately: ordinary Inspect item scans advance carton observations differently from whole-Store-line confirmation. Follow the displayed count and disposition; do not treat the Store shortcut as permission to bypass inspection evidence or Hold confirmation.

Wrong-item, unknown, duplicate, stale, and completed-line scans are rejected. Compare the label, active WRR, lot, and line state rather than repeatedly scanning a rejected label.

## 6. Allocate every declared box through the four steps

### Step 1 ? primary location

Select an offered storage rack for normal receipt or an inspection holding bay for held goods. The primary choice is the initial placement for the declared line. Read occupancy/capacity information where shown; the server checks it again when saving.

### Step 2 ? split storage, Hold, or Missing

Expand the detailed allocation when boxes need different outcomes. Each declared box must have a truthful result:

- **Storage location:** physically present, assigned to that rack/location.
- **Inspection location:** physically present, held for quality review.
- **Missing:** declared but not received; must not become present stock.

Use the actual **Missing** option for absent goods. Do not assign a fictitious physical location to make a total look complete.

### Step 3 ? placement summary

Read **Boxes Assigned**, the base-unit equivalent, location subtotals, and **OS&D shortage** warning. The summary shows the physically received boxes that will be assigned and posted. Check existing contents where offered so the material is placed correctly.

### Step 4 ? physical presence and online confirmation

Verify the presence-attestation checkbox against the real goods. The UI may initially select it after allocation; the operator is still responsible for the assertion. Submit **Confirm & Store / Hold Boxes** only after reviewing the allocation and while connected.

**Expected result:** the server confirms the line and records its actual receipt/placement. A locally saved scan or a recognized item is not that final result. See [Offline capture](offline-and-sync.md) for interrupted connectivity.

## 7. Worked case: eight good, one held, one missing

**Fictional training shipment:** `VMI-100`, lot `LOT-TRAIN-01`, declared 10 boxes at SPQ 50. Nine arrive; one of those nine has damaged packaging.

1. Verify source Organization and the 10-box declaration.
2. Identify the line with a permitted matching label.
3. Choose a valid primary location, such as the offered `A1-01`.
4. Expand per-box allocation: eight good boxes go to permitted storage, the damaged present box goes to an inspection bay, and the tenth declared box is **Missing**.
5. Review nine present boxes = 450 pieces; one of them = 50 pieces is held. The absent box = 50 pieces is a shortage.
6. Attest to the actual nine present boxes and submit online.
7. Reopen WRR, inventory, and inspection views to verify the result. Held goods must not be treated as freely available release stock.
8. Follow authorized shortage closure when the missing box cannot be resolved.

Do not count the missing box as on hand, release held goods, or create another WRR to hide the difference.

## 8. Finish the WRR and hand off the result

Check every required line and the overall status; one successful line does not prove the shipment is closed. Outstanding declared quantities can leave the WRR in receiving progress. The authorized **Finalize with Shortage (OS&D)** process records the exception and finalizes the receipt without creating absent stock. Use actual statuses; do not invent a separate `partial` status.

Give the next operator the Organization, item, lot, real locations, available/held quantities, WRR number, and unresolved exception. Continue with [Inventory and withdrawals](inventory-and-withdrawals.md).

## 9. Recovery decision table

| What you see | Check | Next safe action |
|---|---|---|
| Organization/material absent | Active relationship, material assignment, permissions | Correct enrollment through the authorized owner; refresh the form |
| Invalid carton/SPQ result | Entered unit, enrolled SPQ, source quantity | Correct the declaration or real enrollment; do not round physical units to fit |
| Wrong/unknown barcode | Active WRR, item, lot, label type | Use the correct permitted label; escalate unenrolled material |
| Line already complete | Scan progress and committed state | Continue to an unfinished line; verify before repeating a mutation |
| Capacity/stale allocation error | Live occupancy and per-box totals | Refresh, select valid locations, and review all outcomes again |
| Store timed out | Same line's committed status and inventory evidence | Reopen that record before retrying; preserve the reference if uncertain |
| Saved locally | Queue status versus inventory availability | Reconnect/sync, then complete online placement and receipt confirmation |
