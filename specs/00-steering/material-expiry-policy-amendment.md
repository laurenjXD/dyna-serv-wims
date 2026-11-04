# Material expiry policy amendment

Status: Approved
Date: 2026-11-04 (Asia/Manila)
Implementation status: Authorized; runtime verification tracked separately

## 1. Decision, scope, and approval boundary

The Product Owner accepted an item-level choice between **Block release** and **Allow with acknowledgement** for stock past its recorded expiry date, together with receiving, storage, picking, dispatch, inspection, reservation recovery, warnings, and audit handling. Non-perishable materials may be sold after expiry when explicitly configured to allow it. Non-perishability alone never grants that permission.

The Product Owner explicitly approved implementation on 2026-11-04 (“i approve and implement it rn”). Canonical storage, security, movement and recovery choices are resolved in the approved `01`/`02` sections and incorporated into the affected feature triads by reference. The System supplies the second specification approval under the documented standing convention after this design reconciliation. Existing Approved baselines remain Approved. Implementation authorization does not claim that runtime tests, migrations, deployment, or UAT have passed.

Depends on: approved foundational contracts in `01-core-data-model`, `02-rbac-roles`, `03-offline-mode-and-client-storage`, `04-services-and-infrastructure`, and `05-ui-shell-and-navigation`, including the approved `01`/`02` material-expiry storage and authorization amendment. Delivery ownership spans receiving/inspection, allocation/dispatch, enrollment, documents, notifications and reporting; no completion percentage or deployment claim is added here.

### Ownership

| Owner | Amendment responsibility |
|---|---|
| `01` | Canonical policy/version and acknowledgement persistence; shared eligibility/date contract; balance, commitment, unit, audit, and read-model invariants. |
| `02` | Policy-management and acknowledgement authorization, Organization/Inventory Model scope, RLS, controlled write-off authorization. |
| `03` / `04` / `05` | Online-only boundaries, scheduled work/retry/outbox infrastructure, accessible mobile presentation. |
| `06-party-and-item-enrollment` | Item-level policy editor under existing `items.manage` authority. |
| `07-incoming-receiving` | Staged-date validation, destination checks, receiving acknowledgement, atomic receipt. |
| `08-outgoing-withdrawal-and-two-stage-commitment` | Shared allocation predicate, draft/DRA parity, generation acknowledgement, dispatch revalidation, reservation recovery. |
| `10-pick-list-and-acknowledgement-receipt` | Historical expiry-policy/acknowledgement snapshots and visible affected-lot warnings in priced documents. |
| `11-transfer-and-inspection` | Physical segregation, holds, returns, rejection/write-off disposition and evidence. |
| `14-notifications-and-alerts` | Deduplicated expiry attention delivery; no authority to change quantities. |
| `16-reporting-and-analytics` | Expiry/eligibility breakdown, authorized exports and history projections using `01` contracts. |
| `12-vmi-billing` / `13-trading-orders-and-pricing` | Compatibility review: expiry itself makes no physical movement, billing exclusion, automatic discount, or pricing-policy change. |

## 2. Requirements

### R1. Explicit item policy

WHEN an authorized master-data user enrolls or changes an item, THE SYSTEM SHALL expose exactly `block_release` (Block release) and `allow_with_acknowledgement` (Allow with acknowledgement), SO THAT past-date release is an explicit business choice.

- New items default to Block release. Existing items receive the same conservative default through an approved, auditable migration; do not infer the permissive policy from `items.is_perishable`, category, name, or Inventory Model.
- Policy applies to each lot of that item across the existing VMI, Trading, and Supplies partitions. It does not transfer stock ownership or authorize cross-Organization use. Any future Organization-specific exception requires a separately approved contract.
- Server commands require current `items.manage` and authorized scope for policy edits. Record old/new values, policy revision, actor, server timestamp, and reason. Existing ordinary workflow authority is still required to acknowledge receiving/generation/dispatch; acknowledgement is not a new supervisor approval queue type.
- An ordinary floor operator cannot change the policy from an expiry warning. No new capability identifier is introduced until `02` explicitly defines it.
- Policy changes invalidate unconsumed stale policy snapshots and require review of affected open work. A permissive edit never clears an independent hold, quarantine, rejection, or legacy `expired` status.

### R2. Date definition and validation

WHEN a workflow evaluates expiry, THE SYSTEM SHALL compare the recorded date against the current server-derived calendar date in Asia/Manila, SO THAT all devices use the same cutoff.

- A lot is past expiry when `expiry_date < current Manila date`. It is valid through its printed expiry day. On the next day it is one day past expiry. Calculate days using calendar dates, not elapsed 24-hour intervals or the browser timezone.
- Retain `lots.expiry_date` as the authoritative post-receipt date. Staged receiving uses `wrr_items.expiry_date`; disagreement after commitment is a data-integrity issue, not a permissive fallback.
- A recorded expiry date is evaluated even when `items.is_perishable = false`. Rotation remains the approved FIFO/FEFO rule; allowing release does not silently change non-perishable FIFO to FEFO.
- Required expiry dates (including the existing perishable requirement) cannot be bypassed by choosing Allow with acknowledgement. A non-perishable item whose expiry date is legitimately optional and absent is shown as “No expiry date recorded”; it is not labelled expired. Validate supplied dates as actual calendar dates, not only a string format.
- Missing policy, invalid date, or unavailable authoritative validation blocks the affected final command with a correction/retry path; do not assume permission or display a successful acknowledgement.

### R3. Receiving expired material

WHEN stock is already past expiry at receipt confirmation, THE SYSTEM SHALL evaluate the current item policy and carton destinations on the server, SO THAT expired material is never silently accepted into releasable stock.

- Block release: Storage acceptance is blocked for affected cartons. The operator can assign an Inspection destination; the existing `07`/`11` quarantine and disposition process owns hold, rejection, or return. Do not automatically claim the cartons have physically moved to Inspection.
- Allow with acknowledgement: show the affected item/lot, expiry date, days past expiry, quantity and destinations; require an unselected explicit acknowledgement and non-empty reason before normal Storage confirmation. Independent non-conformance or Inspection destinations retain their ordinary restrictions.
- Receipt to Inspection under either policy remains quarantined and never becomes sellable through acknowledgement alone. Missing carton handling is unchanged and creates no inventory.
- Commit receipt, its acknowledgement evidence, lot segments, units, balances, and receiving ledger atomically. A duplicate confirmation returns the prior confirmed outcome without duplicate stock or acknowledgement records.

### R4. Storage, inventory display, and alerts

WHEN stored stock passes its expiry date, THE SYSTEM SHALL present its expiry condition and policy-based eligibility separately from physical quantity and quality state, SO THAT staff can identify what can be released and what needs disposition.

- Block release excludes the affected lot from releasable stock immediately, even if its persisted operational status still reads `available` or a scheduled job has not run.
- Allow with acknowledgement keeps otherwise eligible material available for selection with an expiry warning. It is not blanket-marked `expired` in a way that makes the configured permission unusable.
- Quarantined, held, rejected, staged, depleted, and otherwise unavailable stock stays excluded under both policies. Acknowledgement is never a bypass for these states.
- Retain physical `qty_remaining`, location, ownership and occupied volume until an actual authorized movement/disposition. Expiry alone inserts no inventory movement and does not zero balances, end VMI occupancy billing, or erase financial history.
- Show on-hand, committed, releasable, expiry-blocked, and quality-unavailable quantities without counting a physical unit more than once. The permissive category is labelled “Past expiry — acknowledgement required,” not “Expired — blocked.”
- Emit a deduplicated Supervisor attention event when stock first crosses expiry, including policy and affected open commitments. Delivery is owned by `14`; delayed or failed delivery cannot enable a blocked release or roll back confirmed stock work.

### R5. Picking and pick-list generation

WHEN a manual or DRA-import draft requests stock, THE SYSTEM SHALL use the same current-date/policy eligibility contract, SO THAT previews and authoritative allocations agree.

- Block-release past-date stock is excluded before FIFO/FEFO ranking; available quantities and shortages use eligible stock only.
- Otherwise eligible permissive stock stays in the approved FIFO/FEFO order and is visibly flagged. Do not silently prefer newer material or require an order override solely because expiry was acknowledged.
- Before generation, review all affected lots/locations/quantities together, require explicit acknowledgement and a reason, and bind it to the exact server-validated allocation. One deliberate confirmation may cover multiple explicitly listed affected lines; no hidden blanket acknowledgement.
- Generation atomically persists reservations, snapshot/evidence, policy revision and acknowledgement. Changing item, Organization, Inventory Model, lot, date, quantity, location, policy, or allocation version requires a new review when it changes the acknowledged facts.
- FIFO/FEFO override decisions remain separate. They do not authorize expiry-blocked or quality-unavailable stock. Acknowledging expiry does not waive an order override that is otherwise required.

### R6. Dispatch and reservation recovery

WHEN dispatch is submitted, THE SYSTEM SHALL revalidate expiry, current policy, quality state, allocation/version, stock identity, permissions, and commitments in the final transaction, SO THAT material that expires after generation cannot leave through a stale approval.

- A pick-list acknowledgement is evidence for generation only. If any dispatched lot is past expiry under the permissive policy, dispatch requires its own explicit acknowledgement and reason against the current review. Newly expired lots must appear in that review even if the original document had no warning.
- A changed date, policy, allocation, or newly applied hold invalidates an unconsumed dispatch review. The operator refreshes and reviews again; no automatic checkbox selection or reuse of a stale client confirmation.
- Blocked expiry stops the entire atomic dispatch before any physical-stock decrement or dispatched state. Keep the existing complete-dispatch contract; do not silently dispatch only unaffected lines.
- Offer an explicit **Review replacement stock** recovery. `08` owns the authorized recovery transaction: identify the blocked reservation, release/supersede the exact affected old commitment through an audited conditional transition, and produce a reviewed replacement plan. Do not reserve replacement stock or alter issued documents before review/confirmation. Release alone changes `qty_committed`, not `qty_remaining`.
- Recovery cancels the whole indivisible pick list using the `cancelled` header state added in `01`. Atomically release all its active commitment lines/header, decrement the corresponding `qty_committed`, and release its reserved/selected carton identities. Preserve old scan/history evidence without treating it as valid for replacement work. No `qty_remaining` decrement occurs. Replacement begins as a new reviewed draft retaining the original demand and cancelled-document identity; new reservations are created only on explicit generation. Never leave released lines behind an executable header.
- If valid replacement stock is insufficient, retain the full demand and show the precise shortage. Never pretend the original quantity has been fulfilled or silently reduce it. Do not create duplicate reservations on retry.
- Physically picked cartons must be accounted for through the existing floor/inspection process before replacement scan evidence is accepted. Replacement identity invalidates old pick/dispatch scan evidence for those lines. Existing generated documents remain historical and any replacement is versioned/superseded under `10`.
- Expiry-caused recovery is an explicit amendment to `08`'s no-general-cancellation v1 contract; it is not unrestricted manual cancellation. Commitment timeout remains distinct from material expiry.

### R7. Inspection and final disposition

WHEN expired stock requires segregation or removal, THE SYSTEM SHALL use `11`'s controlled inspection/disposition workflow with exact quantities and evidence, SO THAT system balances follow actual authorized handling.

- Available outcomes are hold/quarantine pending decision, return to the authorized owning/source Organization, rejection to the designated location, or separately authorized write-off. Location and Organization choices remain scoped to the actual lot and Inventory Model.
- Release committed quantities through the `08` recovery contract before transferring/returning/writing off that reserved portion. Do not mutate outbound commitments from an inspection command.
- Record the selected quantity, reason, actor, timestamp, destination/recipient, evidence, and linked movements. Partial dispositions affect only their stated quantity; they do not zero the entire lot.
- An inspection pass cannot reopen a block-release lot while its recorded date is still past expiry. Permissive stock also needs an explicit quality-release decision before a quarantine is lifted. Date corrections require an authorized audited correction, not a bypass from the warning.
- Stored-stock physical return and write-off use `inventory_reconciliation` with exact quantity, disposition subtype, source lot/location, recipient/evidence and before/after balances retained in disposition/audit records. Reject-location movement uses `transfer`; hold creates no movement. Return/reject/hold require `inspection.resolve`; write-off additionally requires the Administrator role and a separate explicit confirmation with reason. Scoped transaction validation is mandatory; an earlier inspection pass is not write-off authorization.

### R8. Documents, history, and failure states

WHEN a document or history view represents a past-expiry release, THE SYSTEM SHALL retain the confirmed release facts and acknowledgement, SO THAT later policy changes cannot rewrite that decision.

- Pick lists visibly identify the affected lot and recorded expiry date. The dispatch snapshot and Delivery Receipt / Acknowledgement Receipt carry the confirmed expiry condition for released affected lines. Neither document implies that a customer personally accepted the material merely because an employee acknowledged it.
- Keep both documents priced under the existing Trading-final/VMI-reference semantics. Expiry never automatically discounts a sale or changes its pricing snapshot.
- Persist stage, actor, server timestamp, reason, exact source identities/quantity, recorded expiry date, evaluated business date, policy revision, allocation/document version and command idempotency identity. Operational acknowledgement is not a customer signature or a generic approval boolean.
- Retain acknowledgement/audit and connected lot-history evidence permanently through the existing verified hot/cold retention policy; generated documents use the same permanent tiered policy. Do not turn daily read-model refresh into an evidence deletion policy.
- Present pending, failed, stale, offline, unavailable, and confirmed outcomes distinctly using the canonical error-message guide. A successful dispatch followed by PDF failure remains confirmed dispatch plus document retry, not an inventory rollback.

## 3. Design contract and canonical schema dependencies

This amendment consumes `01`'s `items` (`id`, `is_perishable`), `lots` (`id`, `item_id`, `lot_number`, `expiry_date`, `status`, `flow_type`, `owner_party_id`, source provenance), `lot_location_balances` (`id`, `lot_id`, `location_id`, `qty_remaining`, `qty_committed`, version), `wrr_documents`, `wrr_items` (`expiry_date`), `inventory_units`, `inventory_commitments`, `inventory_commitment_lines`, `pick_lists`, `pick_list_items`, `inventory_transactions`, `audit_log`, and the `lot_inventory_totals`, `master_inventory_tracking`, and `lot_history_export` read-model contracts. It also consumes `11`'s `inspection_cases`, `inspection_evidence`, and `inspection_dispositions`, and `10`'s `generated_documents`. No parallel stock, reservation, or user-role ledger is introduced.

### D1. One authoritative eligibility contract

`01` defines one shared server/database contract combining operational availability, valid source identity/scope, quantity, current date and explicit item policy. Both read projections and mutating workflows consume that contract. Acknowledgement is an additional command prerequisite for permissive past-expiry stock, not a quality-status transition.

This deliberately replaces `tech.md`'s earlier “lot status is the sole FIFO/FEFO eligibility gate.” Shared eligibility requires `status = available` and either no applicable past date or an explicit permissive policy; final commands separately require current acknowledgement where applicable. Lot status continues to exclude independent unavailable/quality states. A scheduled sweep may update attention projections but is not the authorization boundary and must never blanket-close permissive lots.

Legacy `lots.status = 'expired'` rows remain excluded until an authorized reconciliation establishes why they were closed and whether quality conditions permit release. Changing an item's policy must not bulk-reset them to `available`.

### D2. Approved additive persistence owned by `01`

The canonical `01` amendment defines `items.expiry_policy`, positive `items.expiry_policy_version`, immutable `expiry_acknowledgements`, and the `cancelled` pick-list header state. Downstream features consume its fields/constraints rather than redefine tables. Backfill defaults existing items to Block release and preserves all existing quality states/quantities. `02` defines scoped reads and guarded transaction writes; direct evidence update/delete is denied. The exact storage and recovery contract is approved in `01` design; runtime verification remains required.

Store acknowledgement evidence with the owning successful command in the same transaction; replay returns the prior result. A changed request fingerprint with the same operation identity is a conflict. Requests that fail authoritative validation create no completed acknowledgement or inventory movement. Audit rejected attempts under the existing audit contract without representing them as accepted releases. No mutable checkbox on `items` or client-submitted actor/timestamp is sufficient evidence.

### D3. Concurrency, scheduler, and document boundaries

Lock or conditionally claim the relevant policy/allocation/lot/balance and parent command state in a consistent order. Re-evaluate current server business date at the final authoritative eligibility step; do not hold a client review open across midnight as authority. Policy edits and allocation/dispatch must serialize or detect stale revision. A final release succeeds with all its acknowledgement/quantity mutations, or none.

Daily expiry attention work is retryable and deduplicated by lot, expiry date, policy revision and threshold event. It never modifies physical balances or finalizes dispatch. Direct command checks remain correct when the job is delayed or absent. `14` delivers only authorized scoped notifications through the existing pipeline; scheduled expiry observation and delivery failures are monitored through `04`.

Document jobs consume the confirmed immutable snapshot and remain retryable under `10`. Existing generated artifacts are not rewritten on policy/date edits. Regeneration preserves historical facts and template/version identity.

### D4. Offline behavior

Policy edits, receiving acknowledgement/final confirmation, authoritative allocation/generation, expiry recovery/reallocation, dispatch acknowledgement/finalization, quality release, returns and write-off decisions are **Tier 2: online-only**. None can enter the offline queue. Existing approved Tier 1 scan/inspection observation capture may continue as observations; replay must recheck current expiry/policy and cannot manufacture acknowledgement. Cached inventory/document views clearly show their last-known state and do not authorize release.

### D5. Feedback and floor presentation

Apply `error-message-writing-guide.md`, `ui-ux-design-plan.md`, the shared edge-case matrix, and local `/ui-ux-pro-max`. Use persistent text plus icon beside affected lots, an explicit initially unselected acknowledgement, a reason field with inline validation, focus-managed review, accessible alerts/errors, and the existing floor primary-action pattern at 375/430px. Toasts and color alone are insufficient. Preserve valid inputs on validation/connection failure; show success only after server confirmation.

The review states the actual consequence: permissive stock can continue after acknowledgement; blocked stock needs replacement or Inspection. A warning never says an acknowledgement guarantees material quality or customer consent. A missing/failed policy query is “unavailable,” not an empty list of expired lots.

## 4. Implementation and verification tasks

All tasks below are unchecked; this document introduces no code or test-result claim.

- [x] **T1 — Canonical contract and specification sign-offs (R1–R8, D1–D3):** affected requirements/design/tasks incorporate this approved amendment; `01`/`02` define persistence/state/security and `tech.md` adopts the shared predicate. Product Owner implementation approval and System standing second specification approval recorded 2026-11-04. Backfill/migration runtime verification remains T2/T8.
- [ ] **T2 — Policy and evidence foundation (R1/R2/R8, D1/D2):** implement approved additive migration, immutable scoped evidence and policy revisions with canonical date helper and eligibility predicate. Unit and real-Postgres/RLS tests are required.
- [ ] **T3 — Enrollment and receiving (R1–R3, D4/D5):** expose explicit policy and audit edits; validate date/placement; make permissive receiving acknowledgement atomic. Unit, component, real-Postgres and Playwright coverage are required.
- [ ] **T4 — Inventory/alerts (R2/R4, D1/D3):** apply shared read-model eligibility, non-overlapping quantity breakdown and expiry-attention scheduling/delivery. Unit/read-model integration and scoped delivery tests are required; verify job delay does not permit blocked stock.
- [ ] **T5 — Generation/dispatch/recovery (R5/R6, D1–D5):** implement manual/DRA parity, exact acknowledgement binding, current dispatch checks, controlled reservation release/supersession, replacement review and stale scan invalidation. Unit, real-Postgres concurrency and Playwright coverage are required.
- [ ] **T6 — Inspection/disposition (R7, D1–D4):** reconcile stored returns/write-offs and implement exact-quantity authorized outcomes with commitment boundary checks. Unit, real-Postgres/RLS and end-to-end disposition coverage are required.
- [ ] **T7 — Documents/reporting (R4/R8, D3/D5):** version historical snapshots, visible pick-list/receipt warnings, permanent history, scoped exports, unchanged pricing and physical-occupancy billing semantics. Snapshot/component, integration and Playwright coverage are required.
- [ ] **T8 — Independent verification (all requirements):** complete DB migration, RBAC/RLS, offline-sync, workflow integration and design-system review using the repository's named reviewers. Run appropriate checks and record actual evidence; do not equate spec approval, implementation, verification and UAT.

### Required test cases

| Layer | Evidence required |
|---|---|
| Unit / component | Manila cutoff (including UTC previous day), expiry day vs following day, leap/invalid dates, days-past calculation, optional vs required absent date, non-perishable with recorded past date, both policies, all unavailable states, FIFO/FEFO stability, manual/DRA parity, reason/ack validation, stale policy/date/allocation review. |
| Real PostgreSQL | Actual migration chain/backfill and RLS; cross-Organization/Inventory Model and direct-write denial; atomic receipt/ack, reserve/ack, dispatch/ack; lost-response replay without duplicates; concurrent dispatch/recovery/policy edit/inspection; no overcommit or stock decrement on blocked dispatch; partial disposition preserves unrelated quantity; policy edit does not unquarantine or reopen legacy expired stock. |
| Playwright | Enrollment policy; blocked inbound Storage correction to Inspection; permissive receiving; persistent lot warning; mixed-lot acknowledgement; newly expired reserved stock at dispatch; policy change invalidates review; replacement/shortage recovery and rescan; offline Tier 2 block without queue entry; document warning/history/retry; 375/430px floor and keyboard/assistive-technology behavior. |
| Integration / regression | Delayed scheduler; deduplicated alert retries; financial field redaction; existing Trading final prices and VMI reference pricing; physical on-hand/CBM remains until recorded movement; unchanged commitment-timeout behavior; no new dispatch scheduling dependency. |

## 5. Out of scope and resolved design decisions

Out of scope: automatic quality certification, automatic customer consent, changing shelf-life dates from an acknowledgement, new automatic discounts, per-Organization policy exceptions, automatic disposal/stock deletion, general pick-list cancellation, partial dispatch, a new expiry approval queue, or deferred `19` scheduling/tracking.

Routine technical choices are resolved in the canonical `01`/`02` amendment: explicit versioned policy, immutable stage evidence, existing workflow capabilities, whole-document expiry recovery, controlled reconciliation for returns/write-offs, and no automatic reopening of legacy expired stock. Migration, security, concurrency and deployment verification remain implementation tasks, not unresolved business decisions.

## 6. Amendment sign-off

- [x] Product Owner business direction — User, accepted in conversation 2026-11-04: item-level permissive release with acknowledgement plus the related edge-case handling.
- [x] Detailed owning-feature requirements/design/tasks reconciled by reference; canonical schema/state/authorization choices resolved in `01`/`02`.
- [x] Accepted business approval carried into R1–R8; technical reconciliation does not require repeating that approval unless it materially changes the accepted behavior.
- [x] Product Owner implementation approval — User, explicit “i approve and implement it rn”, 2026-11-04.
- [x] Second specification approver — System, standing auto-sign-off convention, 2026-11-04, after design reconciliation; runtime verification is tracked separately.
- [ ] Implementation verification and UAT evidence recorded separately from specification approval.
