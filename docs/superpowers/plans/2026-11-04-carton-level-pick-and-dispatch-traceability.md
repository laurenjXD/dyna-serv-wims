# Carton-Level Pick Reservation and Dispatch Confirmation

Status: Proposed implementation plan — specification amendment and required sign-offs precede code changes
Date: 2026-11-04
Owner: Product Owner / implementation team

## Objective

Keep the floor workflow light while preserving the identity of the cartons assigned to an outbound pick:

1. When a pick list is committed, assign existing `inventory_units` carton identities to each committed pick-list line, in the already-approved FIFO/FEFO order and within its exact lot/location allocation.
2. Keep the **To Pick** review/checklist screen non-scanning. Retain its current approval/advance action.
3. In **To Dispatch**, require one scan of every preassigned carton QR, exactly once. Each scanned carton must belong to that exact pick-list line. A line is complete only when every assigned carton is scanned.
4. Final dispatch remains the sole inventory decrement boundary. It dispatches the preassigned carton records and aggregate quantities atomically.

This is carton-level verification at the dispatch/pick handoff. Staff scan each carton once in Dispatch; there is no second line-level scan and no scan at the To Pick approval screen.

## Current state and gap

- `inventory_units` already stores one durable row and unique QR identity per physical carton, including lot, location, status, and optional `pick_list_item_id` association.
- Inventory QR lookup resolves carton IDs to the corresponding carton, item, lot, location, and status.
- Stage 1 currently commits aggregate `inventory_commitment_lines` and `pick_list_items`; it does not reserve a specific set of carton rows.
- Current dispatch scan may identify an exact carton, but the action can assign the remaining boxes for that line server-side. This does not mean those additional physical carton labels were scanned.
- The approved `08` contract currently describes line-level dispatch scan evidence and server-side unit assignment. This proposal changes the assignment timing and lifecycle, so `08` requirements/design/tasks need a signed amendment before implementation.

## User workflow

### 1. Draft and approval

- Build the pick list as today, including DRA-imported or manual demand and the reviewed FIFO/FEFO lot/location quantities.
- Resolve and approve any required alternate-pallet/FIFO override before commitment. A pending override must not reserve carton rows.
- On successful Stage 1 commitment, the server selects exact existing carton IDs for every committed line, records the line association, and reserves those cartons with the aggregate commitment.
- The pick-list detail/PDF may show carton IDs or a compact carton range/manifest for lookup and exception handling. It must not imply that cartons were physically scanned or picked.

### 2. To Pick checklist (no QR scanning)

- Keep the current non-scan To Pick checklist and **Mark as Picked** action.
- Show each line's item, lot, location, box quantity, and assigned-carton count. Provide a manifest/detail view where authorized users can inspect the assigned carton IDs.
- Marking the list as picked records the operator's line/list confirmation only. It does not change assigned cartons to dispatched, decrement stock, or insert an inventory transaction.
- If assigned cartons cannot be found, damaged, or substituted, do not edit the server assignment locally. Route the list to an approved exception/reallocation workflow; until that exists, block dispatch and give the operator the defined supervisor path.

### 3. To Dispatch (one scan per assigned carton)

- Present one dispatch task per committed pick-list line (the line is already one exact item/lot/location allocation).
- Accept a unique registered carton QR only when it belongs to the current pick list and exact line. Reject unassigned, duplicate, already dispatched, wrong-lot, and wrong-location carton scans.
- Persist each carton scan as server-authoritative evidence. A line becomes complete only when its assigned carton count has been scanned; scanning one carton never confirms the rest of the line.
- Show progress at both levels: scanned/required cartons per line and overall pick-list totals. A split lot/location retains a separate assigned carton set for each line.
- After every assigned carton is scanned, enable **Confirm Dispatch**. Reuse the accepted evidence; do not require another line QR scan.

### 4. Atomic final dispatch

In one authoritative transaction, revalidate actor/scope, list state, commitment, scan evidence, line-to-carton assignments, carton statuses, exact carton count, lot/location balances, and document/pricing prerequisites. Then:

- decrement each affected `lot_location_balances` row and release its committed quantity;
- transition the matching commitment lines/header and pick list exactly once;
- transition every assigned `inventory_units` carton to dispatched and append its `carton_status_history` entry linked to the dispatch transaction;
- insert immutable `inventory_transactions` pick rows with `pick_list_id` and exact lot/location linkage;
- trigger the priced Delivery Receipt / Acknowledgement Receipt workflow.

Any failed validation rolls back all writes. A retry after success returns the original result and never decrements or dispatches cartons twice.

## Data and transaction design to finalize in the spec amendment

### Carton reservation lifecycle

The current `inventory_units` check constraint permits `available`, `selected`, `dispatched`, and `quarantined`; available/quarantined rows must have no pick-list line, while selected/dispatched rows must have one. The amendment must choose and document one safe representation for “assigned at commitment but not yet physically picked.” Preferred direction: add a distinct `reserved` carton state tied to its `pick_list_item_id`, rather than calling reserved cartons `selected` before the physical operation. Confirm constraint, expiry/release behavior, and RLS in `01` before coding.

Stage 1 must lock/version-check the target carton rows and aggregate lot/location balance in the same transaction. It must reserve exactly `number_of_boxes` carton rows for each `pick_list_items` line, all matching that line's item, lot, and location. The carton's existing unique QR identity is reused; no replacement carton QR is generated.

The database must enforce that one carton cannot be reserved by two active commitments. The plan should prefer the existing unit-to-pick-line relation with a constrained reserved state if it can express all lifecycle/release invariants safely; otherwise `01` must approve a dedicated assignment relation. Do not add a second stock ledger or make carton rows the quantity authority: `lot_location_balances` remains authoritative for quantity.

### Eligibility and data readiness

- A line can be carton-reserved only if it has exactly one eligible, active `inventory_units` row per committed box at the chosen lot/location.
- Never fabricate QR IDs, reuse carton IDs, or silently fall back to aggregate-only dispatch for a line that promises carton-level traceability.
- Before rollout, audit active balances against eligible carton-row counts, including migration-origin stock and pending carton trace status. Produce a remediation/backfill path for mismatches and a clear blocked state for unresolved stock.
- Preserve each QR's stable `unit_id`/`carton_id`; printing/reprinting does not create a new physical identity.

### Release, expiry, and exception handling

- Commitment expiry/release must atomically release both aggregate reservations and reserved carton assignments, clear line links as appropriate, and write the required carton history/audit record.
- A stale or failed dispatch must not leave orphan reserved cartons or double-release quantities.
- Manual partial carton substitution, damage, and reallocation are out of this first implementation unless `08` explicitly resolves them. Until then, fail closed with a recoverable, supervisor-directed message.

## UI behavior and feedback

- Reuse the existing floor design system and mobile-first rules: full-width 64px primary action, touch-sized controls, no shell navigation in active task flow, visible focus, and status that does not rely on color alone.
- To Pick has a clear checklist, assigned-carton count/manifest, and one primary **Mark as Picked** action; no scanner field or camera CTA appears there.
- To Dispatch has a scanner-ready task list with carton and line progress, such as “7 of 12 cartons scanned; 2 of 3 lines complete,” and a final **Confirm Dispatch** action only when every assigned carton is scanned.
- Wrong, unassigned, duplicate, already-dispatched, stale, and unavailable carton scans preserve context and give a concrete next action using `specs/00-steering/error-message-writing-guide.md`.
- Report carton scan progress accurately. A line is ready only when every carton assigned to it has an accepted scan.

## Implementation phases

### Phase 0 — Amend and approve contracts (no app code)

1. Amend `specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md` with the Stage 1 carton assignment, non-scan To Pick checklist, one assigned-carton QR scan per carton at dispatch, and atomic carton lifecycle.
2. Amend `08/design.md` with transaction ordering, carton eligibility, state transitions, release/expiry, RLS, idempotency, UI behavior, and document/audit linkage.
3. Amend `08/tasks.md` with ordered schema, server, UI, migration-readiness, exception, documentation, and verification tasks. Preserve the existing approval gate and fill both sign-offs for this amendment before code work.
4. Review `01-core-data-model` impact: carton reservation status/constraints, assignment relation choice, history linkage, and migration/backfill contract. Any 01 amendment receives its own required verification and sign-offs.
5. Confirm whether 03's offline scan-observation contract changes. Final dispatch remains online-only; no queued client observation may count as accepted dispatch evidence without 03's approved contract.
6. Reconcile `18-barcode-integration` and user manual wording with the exact scan semantics.

### Phase 1 — Data readiness and database contract

1. Audit live/local inventory model data shape without mutating production: carton rows per eligible balance, pending migration-origin trace rows, duplicate or orphan assignment candidates.
2. Design one forward-only migration for the approved reserved state or assignment relation, constraints/indexes, and any safe history/transaction linkage. Reserve the next migration number only after checking the current journal.
3. Implement RLS for only the approved read/mutation paths. Verify two concurrent commitments cannot reserve the same carton, release/expiry restores availability exactly once, and unauthorized/cross-scope actors cannot read or mutate assignments.
4. Establish a rollout/backfill procedure. Do not enable carton-exact commitment until existing eligible balances are reconcilable to carton identities.

### Phase 2 — Stage 1 exact-carton assignment

1. Extend the authoritative commitment transaction to select eligible cartons in deterministic FIFO/FEFO and location order under locks/version checks.
2. Tie exactly the required carton count to every committed pick-list item and reserve them atomically with `qty_committed`.
3. Reject insufficient carton identities even if aggregate balance alone appears sufficient; return an actionable discrepancy state.
4. Include assigned carton manifest/count in the authoritative pick-list read model and optionally the operational PDF. Keep pricing and aggregate quantity snapshots unchanged.
5. Cover idempotent retries and all-or-nothing multi-line drafts.

### Phase 3 — Non-scan To Pick experience

1. Keep the current checkbox/task checklist and **Mark as Picked** command; remove/avoid scanner entry on this route.
2. Display assigned carton count and authorized manifest details so the picker knows which physical identities were allocated.
3. Preserve the no-decrement/no-reassignment boundary at this step. Keep expiry and exception states explicit.

### Phase 4 — Dispatch scan and carton lifecycle

1. Change `selectPickUnit` so a carton QR can only match a carton already reserved to that exact pick-list line. It must not select extra unscanned cartons to fill the line.
2. Persist one scan-evidence state per carton, idempotently. Reject duplicate carton scans without mutating another carton.
3. Require exactly one scan per assigned carton and retain the existing final dispatch CTA. Do not require an extra line-level scan.
4. Update `dispatchPickList` to dispatch the exact preassigned carton set and aggregate commitment atomically, update carton statuses/history, write linked inventory transaction(s), and preserve document handoff behavior.
5. Ensure offline replay, if enabled, revalidates the bound pick-list line/carton assignment server-side and cannot replay a stale or cross-line scan.

### Phase 5 — Reconciliation, docs, and rollout

1. Update the inventory carton detail/modal so the carton timeline shows pick-list assignment, line confirmation, final dispatched status, actor/time, and linked transaction/receipt where authorized.
2. Update pick-list and dispatch user manual sections. Explain that the scan confirms one packed line and that staff must pack its assigned carton set.
3. Add operational reporting for carton-assignment mismatch and blocked inventory awaiting trace reconciliation.
4. Deploy only after approved migrations are reviewed/applied, data readiness passes, and the documented rollback/feature-disable path is reviewed. A rollback must not erase immutable dispatch/history records.

## Verification plan

### Unit tests

- Deterministic carton assignment for FIFO and FEFO, same-rank lots, lot/location splits, partial balances, and stable tie-breakers.
- Exact carton count equals `number_of_boxes`; wrong item/lot/location, ineligible/pending carton, duplicate assignment, insufficient carton rows, and provisional item gate fail closed.
- Stage 1 retry is idempotent and creates no duplicate assignment; multi-line failure reserves nothing.
- To Pick remains non-scan; checklist state does not alter inventory or carton identity.
- Dispatch accepts each assigned carton QR once; wrong/unassigned QR, duplicate carton scan, scan against another line, stale status, and wrong list status fail without mutation.
- Final dispatch transitions exactly the assigned carton set, decrements aggregate stock once, writes correct `pick_list_id` linkage, and returns the same result on retry.
- Expiry/release clears every assignment and restores aggregate reservation once; no assigned carton is stranded or double-freed.

### Real Postgres and RLS verification

- Apply the full migration sequence to disposable real Postgres; test constraints, lock ordering, assignment uniqueness, and rollback.
- Run concurrent commitments against the same lot/location/carton set; one command may reserve a given carton only once.
- Verify RLS for allowed and denied user/party/flow scopes on assignment rows and carton history.
- Verify concurrent duplicate dispatch attempts produce one immutable inventory result and one carton-history transition per assigned carton.
- Verify expiry, stale-page dispatch, failed document generation after dispatch, and idempotent retry preserve truthful state.
- Audit representative migration-origin and receiving-origin carton rows against aggregate balance and SPQ.

### UI / scanner verification

- At 375px and 430px portrait, confirm To Pick checklist and dispatch scanner are usable with gloves/handheld touch targets and a single primary action per active screen.
- Verify keyboard/focus and screen-reader status for checklist progress, scan success/failure, loading, offline block, and final dispatch readiness.
- Simulate assigned and unassigned carton QR values; confirm exactly one line becomes confirmed for one valid scan.
- Confirm final CTA is disabled until every line has accepted evidence and reuses that evidence without another scan.
- Confirm dispatch readiness stays blocked until every carton assigned to every line has an accepted scan.

## Acceptance criteria

- Each committed `pick_list_item` has exactly `number_of_boxes` existing, unique carton identities reserved from its exact item/lot/location.
- No pick-list draft or pending alternate-pallet request reserves cartons.
- To Pick remains non-scanning and retains the checklist/Mark as Picked action.
- Dispatch requires one accepted QR scan per assigned carton and no extra line scan.
- One carton scan cannot confirm another carton, line, source location, pick list, or unassigned carton.
- Final dispatch updates aggregate balance and every exact assigned carton in one idempotent authoritative transaction.
- Carton lookup/history can trace dispatched carton → pick-list line → pick list → inventory transaction/document where access permits.
- The system records evidence for each carton; it does not claim a line is complete until all assigned cartons are scanned.
- User manual, approved specs, migration records, and implementation agree on behavior.

## Dependencies and constraints

- Canonical contracts: `specs/01-core-data-model`, `02-rbac-roles`, `03-offline-mode-and-client-storage`, `04-services-and-infrastructure`, `08-outgoing-withdrawal-and-two-stage-commitment`, `09-approval-queue`, `10-pick-list-and-acknowledgement-receipt`, and `18-barcode-integration`.
- Existing carton storage: `inventory_units`, `carton_status_history`, `inventory_commitments`, `inventory_commitment_lines`, `pick_lists`, `pick_list_items`, `lot_location_balances`, and `inventory_transactions`.
- Follow `specs/00-steering/ui-ux-design-plan.md`, `specs/00-steering/error-message-writing-guide.md`, and the `/ui-ux-pro-max` skill for floor accessibility, touch, focus, and state feedback.
- Do not add a `warehouse_id`, duplicate quantity ledger, new carton QR identity, or second dispatch transaction boundary.

## Open decision to resolve in Phase 0

The approved direction is the verifiable option: scan every assigned carton once in Dispatch and do not add a redundant per-line scan. This records evidence for every physical carton rather than treating one representative scan as proof of a bundle.
