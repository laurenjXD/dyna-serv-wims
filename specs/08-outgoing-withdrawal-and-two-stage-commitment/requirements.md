# Outgoing Withdrawal & Two-Stage Commitment — Requirements

Status: Approved
Updated: 2026-11-04 (DRA import implementation contract; approval unchanged)

## 1. Purpose and scope

This feature governs outbound withdrawal from the **Stock View** (Master Inventory) surface through FIFO/FEFO allocation, pick-list generation, commitment, physical picking/dispatch scan, inventory decrement, and handoff to priced **Delivery Receipt / Acknowledgement Receipt** documents.

The core safety rule is two-stage commitment:
- **Stage 1 — commitment:** reserve eligible stock and create the operational `pick_list`; inventory remains physically on hand and is not decremented.
- **Stage 2 — physical dispatch confirmation:** verify physical scan at `/pick-lists/[id]/dispatch`, decrement inventory, release reservation, write immutable pick transaction, and produce priced Delivery Receipt / Acknowledgement Receipt.

### Terminology & Sub-tab Alignment
Across all user-facing outgoing screens, forms, headers, and document references:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.
- **Stock View** replaces Master Inventory.
- **Delivery Receipt / Acknowledgement Receipt** replaces Acknowledgement Receipt in UI labels.
- Outgoing Page Sub-tabs: **Outgoing Ledger**, **Logistics**.

*(Note: `parties`, `flow_type`, and `acknowledgement_receipt` remain canonical database identifiers.)*

## 2. Actors and workflow surfaces

### 2026-11-10 amendment — carton-level dispatch evidence

Each dispatch scan SHALL identify exactly one durable inventory carton. Item, lot, and location QR values are lookup aids only and SHALL be rejected as dispatch evidence. A successful scan selects one carton atomically; the line remains incomplete until its required carton count is selected. Aggregate lots without durable carton identities must be reconciled before dispatch, not silently expanded at scan time.

- **Inventory operator** — selects item, destination Organization, Inventory Model, quantity, and allocation action directly from **Stock View** (`/inventory`).
- **Warehouse staff** — executes committed pick/dispatch flows at `/pick-lists/[id]/pick` and `/pick-lists/[id]/dispatch` using portrait handheld screens.
- **Supervisor** — approves FIFO overrides through `09-approval-queue`.
- **Organization user** — views authorized pick lists/documents in **Organization Portal** (`/portal/documents`).

## 3. Sub-Tab Architecture

The Outgoing page (`/outgoing`) features 2 primary sub-tabs:
1. **Outgoing Ledger**: Read-only, paginated audit view of all outbound inventory transactions (`movement_type = 'pick'`).
2. **Logistics**: Active pick list execution queue and dispatch tracking.

## 4. Functional requirements

### R1. Pick-list generation from Stock View

1. An authorized user SHALL initiate pick-list generation from the **Pick Lists** tab of Master Inventory (`/inventory?tab=pick-lists`). One draft selects exactly one destination Organization and one **Inventory Model** (`vmi`, `trading`, `supplies`).
2. A draft SHALL allow multiple item-code lines. Each line records item code, selected lot/location, quantity in boxes, UOM/SPQ, customer item code, and description. The same item may occupy multiple lines only when a distinct source lot/location is required.
3. The user SHALL review the draft in a table-like queue before generation. Removing or editing a draft line changes only the draft; it does not reserve stock.
4. **Generate Pick List** SHALL validate and commit every draft line atomically into one `pick_list`. It SHALL either reserve all lines and create one document number, or reserve none.
5. On a successful commitment, the system SHALL create the operational pick-list PDF from the committed snapshot and expose it for preview/download/print. A PDF failure must surface document attention without reversing the committed pick list.
6. The command SHALL validate active item references, Organization/Inventory Model scope, UOM, and SPQ rules.
7. The command SHALL refuse allocation if `item_code_is_provisional` is true for any requested line, displaying a 3-component error (**What happened**, **Why it failed**, **Next Action / Solution**).
8. **DRA Document Parsing (Excel & PDF)**: The system SHALL offer an optional Delivery Release Advice (DRA) import in Excel (`.xlsx`, `.xls`, `.csv`) and PDF (`.pdf`) formats prior to pick list generation. The parser SHALL identify/map the requesting Organization first using a trusted Organization code or approved alias, then derive or request confirmation of the Inventory Model and role. It SHALL extract requested item codes (`item_code` / `customer_item_code`) and requested box/unit quantities, match them against available inventory balances (`qty_remaining - qty_committed`), auto-suggest FIFO/FEFO lot/location allocations, and present a pre-commitment preview queue highlighting any stock shortages or provisional items for review. Ambiguous or unmatched Organization references SHALL block generation until reviewed.

#### R1.8 implementation contract (2026-11-04)

- Import reviews every extracted source row before applying it to the browser-local draft. Unmatched, ambiguous, invalid, and zero-quantity rows remain visible until corrected or explicitly excluded; no partial row set is silently accepted.
- Excel/CSV review supports worksheet selection, the header row, and explicit source-column mappings. Searchable PDFs use text extraction; scanned image PDFs require a searchable PDF or Excel/CSV copy. Uploads are limited to 10 MB.
- Review confirms the requesting Organization, its Inventory Model, and the model-specific recipient. Unknown or changed recipient text clears an incompatible suggestion. A requesting-Organization mismatch requires an explicit acknowledgement before applying the import.
- Only a unique exact or canonical item-code match may be selected automatically. Uncertain or description-only matches require manual item selection. Customer item code remains editable, is limited to 100 characters, and conflicting references for the same item must be reconciled, excluded, or placed on separate pick lists.
- Quantities distinguish boxes/cartons from base units and use enrolled SPQ for conversion. Conflicts with the document's box count, quantity, or SPQ require correction acknowledgement. Repeated demand is allocated cumulatively using FIFO/FEFO; shortages retain the requested quantity and block generation until resolved.
- Applying an import requires confirmation before replacing an existing draft. Parsing and review never reserve stock or decrement inventory; the existing Stage 1 commitment remains authoritative.

### R2. FIFO/FEFO allocation & Stage 1 commitment

1. Allocation considers only lots with `status = 'available'`.
2. FEFO applies to perishable items, FIFO to non-perishable items.
2a. The plan SHALL assign one FIFO rank per recorded receipt calendar date, or one FEFO rank per expiry calendar date. Distinct lots within a rank remain separate and ordered by the recorded receipt timestamp/sequence and stable lot-number/ID tie-breaker; locations remain nested within their lot and follow the configured pick sequence or stable location-label fallback. The pick-list draft and DRA preview SHALL show the same rank → lot → location hierarchy. Locations SHALL be selectable with editable box quantities inside that hierarchy. Repeated business lot numbers within a rank SHALL share one visual card while every stock allocation retains its exact internal lot/location/balance identity.
3. If allocation bypasses FIFO/FEFO, the system SHALL block generation and route an override request to `09-approval-queue`.
4. Stage 1 commitment atomically reserves stock and increments `qty_committed` without decrementing `qty_remaining`.
5. The creation UI SHALL show the recommended FIFO/FEFO source by default and offer an explicit **Choose another pallet** path. An alternate selection requires a reason, identifies one exact lot/location/quantity/version, and remains unreserved until another authorized actor approves it.
6. An approved override SHALL be consumable once only. Pick-list generation SHALL reject an expired, changed, mismatched, self-approved, or already-consumed decision.

### R3. Physical picking and Stage 2 dispatch confirmation

1. Pick-list generation produces the operational PDF instructions and creates an `allocated` `pick_list`, not a dispatch-ready one. It returns to the Pick Lists tab with a confirmation and exposes **View / PDF** and **Mark as Picked** beside the list.
2. After the warehouse team physically picks the PDF’s committed lines, an authorized user SHALL use **Mark as Picked**. The system transitions only that list from `allocated` to `picked`; it does not scan, decrement inventory, or alter the reservation. Only then does the list appear in the **To Dispatch** queue and expose **Dispatch**.
3. Dispatch is the sole scan gate. At Stage 1 commitment, the server SHALL assign and reserve exactly `number_of_boxes` existing `inventory_units` carton identities to each committed `pick_list_items` line, matching that line's item, lot, and location. In Dispatch, one QR belonging to the assigned line SHALL confirm that line's full preassigned carton set as an operator attestation that it was gathered and jackwrapped. The scan SHALL be identified as line-level confirmation; it is not per-carton verification.
4. Final dispatch confirmation is enabled only after every committed line has been identified at dispatch. It atomically decrements `qty_remaining`, releases `qty_committed`, writes an immutable `pick` transaction, and makes the priced **Delivery Receipt / Acknowledgement Receipt** available for print/download.
5. A line confirmation scan SHALL match an existing carton assigned to exactly one incomplete line. It SHALL NOT confirm another line or an unassigned carton. The system SHALL record the scanned representative carton and line-level attestation, reject wrong item/lot/location and duplicate completed-line scans, and SHALL NOT require scanning each carton or a second verification scan.
6. When one lot/pallet is stored across multiple locations, Dispatch presents a separate line for each committed location. A lot QR identifies its matching location line; when a shared item QR matches more than one line, the server selects the first incomplete line. One accepted scan confirms only that line’s committed quantity and authoritative lot/location balance.

### R4. Visual design & touch target enforcement

1. Floor screens (`/pick-lists/[id]/pick`, `/pick-lists/[id]/dispatch`) enforce 64px full-width primary CTAs in the bottom third thumb zone, 56px default controls, 16px minimum font size, and zero glassmorphism.
2. Shell navigation is strictly hidden during active scan loops.
3. Surfaces use the cool blue-gray application canvas (`#F3F6FC`) and Level 1 Solid White (`#FFFFFF`) cards with `#2563EB` Vibrant Blue primary accents. Bold titles use DM Sans.
4. The Outgoing page header SHALL omit a generic Filter button when the active view exposes no corresponding filter panel; only contextual, functioning controls SHALL be displayed.
5. The active work surface SHALL present allocated documents in a distinct **To Pick** queue and picked documents in a distinct **To Dispatch** queue. Each queue SHALL retain its own count, empty state, status treatment, and phase-correct action.

### R5. Outgoing Ledger & Delivery Conformance KPI

1. The Outgoing Ledger (`/outgoing?tab=ledger`) SHALL present an interactive KPI card computing overall Delivery Conformance Rate:
   $$\text{Conformance Rate (\%)} = \left(\frac{\text{Conforming Dispatches (Signed POD Uploaded)}}{\text{Total Dispatched Shipments}}\right) \times 100$$
2. The KPI card SHALL feature an interactive dropdown filter allowing operators to toggle the transaction view between:
   - **All Dispatches**: displays all completed outgoing transactions.
   - **Conforming — Signed DR Attached**: filters transactions to only dispatches with confirmed uploaded/approved PODs.
   - **Pending POD / Missing DR**: isolates dispatches lacking physical proof-of-delivery documents for priority follow-up.
3. The KPI card SHALL provide a direct navigation link to the Delivery Conformance Trend Line Graph on the Reports page (`/reports#conformance`).

## 5. Acceptance criteria

- [ ] Pick list generation initiates directly from Stock View (`/inventory`).
- [ ] A Pick Lists-tab draft supports one Organization and multiple item-code/source-location lines, then commits them as one atomic pick list.
- [ ] A successful committed multi-item pick list exposes its generated PDF without using the PDF as the source of inventory truth.
- [ ] User-facing UI labels use Organization, Inventory Model, Stock View, Delivery Receipt / Acknowledgement Receipt, Outgoing Ledger, and Logistics.
- [ ] Stage 1 commitment increments `qty_committed`; Stage 2 dispatch decrements `qty_remaining` and generates Delivery Receipt / Acknowledgement Receipt.
- [ ] 3-component error feedback is displayed on all validation/scan errors.
- [ ] Visual design system rules (#2563EB, #0F172A, #64748B, #F3F6FC, #FFFFFF, DM Sans + Glacial typography, 64px floor CTAs) are fully satisfied.
- [ ] Alternate-pallet requests cannot reserve stock until approved and can only generate the exact approved one-time allocation.
- [ ] Stage 1 assigns and reserves exactly one existing carton identity for every committed box on each pick-list line, within the exact item/lot/location allocation; duplicate or insufficient identities block the whole commitment.
- [ ] Dispatch requires one matching QR per committed line from its preassigned carton set. One scan confirms the line's full carton set by operator attestation; wrong, unassigned, cross-line, duplicate, stale, or already-dispatched scans are rejected. No per-carton scan loop or extra line scan is required.
- [ ] The Outgoing header contains no non-functional or redundant generic Filter action.
- [ ] Allocated and picked documents are visually separated into To Pick and To Dispatch queues and cannot expose the wrong phase action.
- [ ] Generation creates an allocated list in To Pick; only the explicit non-scan Mark as Picked action moves it to To Dispatch and enables Dispatch.
- [ ] Outgoing Ledger displays Delivery Conformance KPI card, live status filter dropdown, and direct link to dashboard conformance line graph.

## 6. Approved amendment — end-customer recipient workflow (2026-10-22)

1. Pick-list generation SHALL select an active enrolled `end_customer` organization before allocation is committed.
2. For VMI, the VMI customer remains the commercial/ownership party and the end customer defaults to that same organization; a different end customer may be selected when the request identifies a downstream recipient.
3. For Trading, the selected end customer is the sale recipient; the supplier is inbound procurement context and is not the dispatch recipient.
4. The selected recipient SHALL be snapshotted in `pick_lists.end_customer_party_id` and shown in the ICL/Pick Lists queue, pick-list print, dispatch screen, Outgoing Ledger, and acknowledgement receipt.
5. The recipient is locked after commitment. A correction requires release/reissue or an authorized superseding document; dispatch never accepts a new recipient from the floor client.
6. If customer and end customer are the same party, the UI displays one combined `Customer / End Customer` value.
## 13. Approved clarification - flow-specific outbound recipient (2026-10-22)

The outbound recipient contract is flow-specific:

1. **Trading**: Dyna-Serv ships warehouse-owned stock to the selected organization enrolled as `trading_customer`. `customer_party_id` and the recipient snapshot identify that trading customer. A separate `end_customer` selection is not shown or required.
2. **VMI**: the organization enrolled as `vmi_customer` is the stock owner and commercial customer. The operator must select an active downstream organization enrolled as `end_customer`; that organization is the recipient snapshot.
3. The immutable database column `pick_lists.end_customer_party_id` is retained as the physical-recipient snapshot for compatibility. For Trading it contains the direct trading customer; for VMI it contains the downstream end customer.
4. Queue, pick-list, dispatch, ledger, print, and acknowledgement-receipt surfaces label the value as `Customer / Recipient` for Trading and `End Customer` for VMI (or the neutral `Recipient` where a shared table cannot use a flow-specific header).

## 14. Approved amendment — full outbound Organization-selector contract (2026-10-22)

This section supersedes any earlier generic destination/end-customer wording.

1. The operator selects Inventory Model first. The valid header matrix is VMI → active VMI Customer plus active End Customer; Trading → active Trading Customer; Supplies → active Internal Supplies Organization.
2. Trading and Supplies SHALL not display an End Customer field. VMI SHALL require both role-specific fields; a VMI Customer is never inferred from a selected End Customer, or the reverse.
3. Supplies auto-selects the Internal Supplies Organization only where there is exactly one active, authorized choice. With no eligible choice, the form blocks and names the missing configuration; with multiple choices, it requires an explicit selection from that restricted list.
4. On an Inventory Model or header-Organization change, the UI clears incompatible recipient data, all dependent item/lot/location candidates, and all draft lines after explicit discard confirmation. No hidden stale IDs may be submitted.
5. The generation transaction validates the current active Organization-role/relationship, actor scope, stock owner/source, item/lot/location Inventory Model, and version before any commitment or pick-list snapshot is created. Client filtering, import values, deep links, and cached dropdown values are non-authoritative.
6. The immutable compatibility column `end_customer_party_id` stores the physical recipient snapshot: the End Customer for VMI, the Trading Customer for Trading, and Internal Supplies Organization for Supplies. It must be labelled `Recipient` or a flow-aware term outside VMI; this does not confer the End Customer business role.
7. Generic/missing legacy relationships remain visible on historical records but are not selectable for new commitments. The operator receives a named Organization-enrollment recovery path. Internal Supplies remains a role classification and must not acquire a `party_flow_relationships` row.

## 15. Approved amendment — VMI owner derives from Organization (2026-10-27)

For VMI pick-list generation, the selected Organization is the VMI Customer
and stock owner. The UI SHALL not render a second VMI Customer / Stock Owner
selector. The server SHALL derive `customer_party_id` from the selected
Organization (`party_id`) and ignore any conflicting client value. The End
Customer / Recipient selector remains separate because the physical recipient
may differ from the stock owner.

## Approved amendment — reserve and verify exact cartons (2026-11-04)

- Stage 1 commitment SHALL reserve the exact existing `inventory_units` rows for each pick-list line, equal to its committed box count and matching its item, lot, and location. The browser SHALL NOT supply carton IDs as allocation authority.
- The To Pick review/approval screen remains non-scanning. Dispatch is the only carton-scan phase.
- Dispatch SHALL scan every assigned carton once. A line completes only when every assigned carton is confirmed. There is no additional line QR scan and no single scan may confirm multiple cartons.
- Final dispatch SHALL atomically transition the exact assigned carton rows, write carton history, update aggregate balances and commitments, and insert the immutable pick transaction.
- If eligible carton identities do not cover the aggregate committed quantity, the entire commitment SHALL fail with a recoverable inventory traceability error; no synthetic identities or silent aggregate fallback are allowed.
- Product Owner sign-off: Lauren, 2026-11-04 (explicit approval to proceed and selection of the verifiable workflow).
- Second sign-off: System standing approval convention, 2026-11-04.

### Product Owner refinement (2026-11-04)

- Reserve exact existing carton IDs at commitment, but use one matching assigned-carton QR per line in Dispatch to reduce floor scanning. This is an operator attestation of the preassigned jackwrapped line, not independent verification of each carton.
- Product Owner sign-off: Lauren, 2026-11-04.
- Second sign-off: System standing approval convention, 2026-11-04.

## Material expiry policy amendment (2026-11-04)

Status: Approved

The [Material expiry policy amendment](../00-steering/material-expiry-policy-amendment.md) R1–R8 and D1–D5 is incorporated into this feature's requirements/design/tasks. Product Owner explicitly approved implementation on 2026-11-04; System supplies the second specification sign-off under the standing convention after design reconciliation. Canonical storage/state/security choices are in `01`/`02`. Runtime implementation and verification remain separately tracked; approval is not a claim that tests or deployment passed.

Use the shared expiry predicate for manual and DRA allocation; record exact-lot acknowledgements, revalidate at dispatch, and provide reviewed replacement/shortage recovery for affected reservations.

The linked approved amendment governs this feature's expiry behavior. Its specification sign-offs authorize implementation; applicable unit, real-Postgres, security, integration and E2E checks remain mandatory before implementation completion is claimed.
