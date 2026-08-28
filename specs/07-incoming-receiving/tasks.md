# Incoming Receiving — Implementation Plan

Status: Approved
Updated: 2026-08-24 (Product Owner decision: batch putaway model adopted; WRR document-field ownership amendment) — resolves the `fix-it-felix` merge contradiction.

## Implementation gate

No receiving route, WRR form, scan queue, inspection mutation, receipt commit, migration, or ledger query may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `01-core-data-model` is approved with final WRR, line, inspection, lot, location, and transaction structures.
- `02-rbac-roles` approves the receiving capability/scope/RLS/audit contract.
- `03-offline-mode-and-client-storage` approves the exact Tier 1 scan command; all other receiving mutations remain online-only.
- `04-services-and-infrastructure` approves Auth, Storage, server transaction, idempotency, email, and monitoring boundaries.
- `05-ui-shell-and-navigation` approves the floor/office shell integration.
- `06-party-and-item-enrollment` confirms unknown-item recovery.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Scope and non-negotiable boundaries

- Staging is not active inventory. No available lots or receiving ledger transaction before confirmed receipt commit.
- The inbound ledger is a view of immutable `inventory_transactions`, not a duplicate table.
- Unknown item recovery uses `06`; it is not a hidden receiving-side enrollment implementation.
- Inbound WRR inspection is distinct from transfer inspection in `11`.
- No party/item/category/location master-data ownership is duplicated here.
- No outbound picking, approval queue, acknowledgement receipt, VMI billing, or Trading price finalization is implemented here.
- No `warehouse_id`, `stock_levels`, `SKU`, `bins`, or alternate receipt ledger is introduced.

## Implementation tasks

### 1. Resolve the inbound domain contract

Testing: Documentation/schema review; no implementation tests.

- [x] Reconcile the raw CIPL/WRR input notes with approved `01-core-data-model` requirements/design. — All `wrr_documents`, `wrr_items`, `wrr_inspection_logs`, `lots`, `lot_location_balances`, and `inventory_transactions` fields confirmed from the approved `01` schema. The `disposition` field on `wrr_items` is the only net-new field; a `01` schema amendment is noted.
- [x] Finalize the WRR status lifecycle and legal transitions, including cancellation and post-start correction behavior. *(Resolved 2026-08-09: supervisor (`receiving.create`) can cancel a WRR at any status, including after scanning has started. Already-confirmed items become a partial receipt — lots and `inventory_transactions` rows are committed; unscanned lines are discarded. ~~WRR closes with `partial` status.~~ **Corrected 2026-08-10: WRR closes with `cancelled` status — `partial` was never an actual enum value; "partial receipt" describes the outcome, not a status. See revision-log.md's 2026-08-10 entry.** See revision-log.md.)*
- [x] **Reopened 2026-08-10, resolved 2026-08-10**: the 2026-08-09 per-line-immediate-commit generalization (design.md §9) makes "some lines committed, some not" the *normal* mid-flight state, not just a cancellation edge case. Product Owner decided no new `wrr_status` value is needed — `receiving_in_progress` already covers this window; per-line completion is tracked on `wrr_items`, not the parent status. Also corrects the 2026-08-09 entry's stale "`partial` status" wording — no such enum value exists or will be added; a cancelled-with-partial-completion WRR closes as `cancelled`. See revision-log.md's 2026-08-10 entry.
- ~~[ ] **Added 2026-08-20, blocked on `01-core-data-model`'s own amendment/approval process**: the Product Owner's per-unit "Hold" override on an otherwise `store`-disposition line (design.md §6.4, requirements.md R3.12/§5a Item 2) has no representation under the current schema (one `lots.status` per WRR line).~~ *(Superseded 2026-08-24: the per-unit commit loop this override would have attached to is itself retired in favor of the batch putaway model (Task 6). There is no per-unit commit event left to hook a per-unit Hold override into, so this item is moot rather than resolved — see design.md §6.4 and requirements.md §5a Item 2/4. If a batch-model-shaped successor is ever needed, it is a new item, not a reopening of this one.)*
- [x] **Amended 2026-08-28**: Finalize whether CIPL remains an attached reference plus manually encoded `wrr_items`, or whether structured CIPL parsing is required. — Adopted: CIPL Excel (`.xlsx`, `.csv`) and PDF (`.pdf`) document parsing is adopted for WRR pre-receiving staging (requirements.md R1a, design.md §5). Populates draft expected lines for back-office verification.
- [ ] **Added 2026-08-28**: Implement `lib/parsers/cipl-parser.ts` parsing engine and `CiPlImportModal.tsx` UI component, with unit tests for Excel & PDF parsing.
- [x] Finalize expected-line fields, scan/reconciliation storage, inspection-log fields, discrepancy states, and lot inheritance rules. — Expected-line field table added (design.md §5.1); discrepancy states defined (§5.2); inspection-log fields confirmed from `01` schema; `lot_number` confirmed as the single canonical identifier inherited verbatim at commit.
- [ ] **Added 2026-08-24, pending reapproval**: add WRR-only CRUD for the documented invoice/MAWB/IP/source-organization and expected-line values, including manufacture date and remarks. Read-only WRR/print views must render the persisted values and system-derived actual receipt values; scan results remain non-editable.
- [x] Define the exact receipt commit invariant: what must be complete before confirmation and what can remain pending for putaway. — Defined in design.md §9: all scan totals, conformance decisions, and disposition values must be valid; putaway is a post-commit handoff, not a commit prerequisite.
- [x] Define whether non-conformant quantities can be committed to a non-available state or must remain outside the committed receipt. — Defined: `inspect` disposition commits the quantity as a `quarantined` lot at the `inspection` location (non-available); `returned_to_vendor` action in `wrr_inspection_logs` means the line is not committed at all (design.md §7, §8).
- [ ] Define party/flow and item activation rules at staging, scanning, and commit time.
- [ ] Record cross-cutting decisions in `specs/00-steering/revision-log.md`.

### 2. Define authorization, audit, and infrastructure contracts

Testing: Authorization contract tests; real-Postgres integration before sign-off.

- [ ] Add receiving capability identifiers to the canonical RBAC catalog and get `02` approval; use capabilities, not role names.
- [x] **Resolved 2026-08-06:** use the existing global `receiving.confirm` capability for back-office advance-notice confirm/reject/match; use `receiving.view` for review/read. The controlled `SECURITY DEFINER` function independently re-checks `receiving.confirm` and the self-review prohibition.
- [ ] Define global operational versus party/flow-scoped access for WRRs, scans, inspections, lots, and incoming ledger rows.
- [ ] Define server-side authorization and RLS behavior for every read/mutation, including attachment access.
- [ ] Define audit events for staging, edits, print, start, scan exceptions, conformance, non-conformance, cancellation, confirmation, and resolution.
- [ ] Define server command idempotency keys, concurrency/locking, transaction boundaries, and safe retry behavior with `04`.
- [ ] Define private Storage paths/signed access for CIPL and inspection evidence.
- [ ] Have `rbac-rls-reviewer` review the access matrix and `db-migration-verifier` plan the real-Postgres checks.

### 3. Implement pre-receiving WRR staging

Testing: Unit validation; Playwright office flows; real-Postgres integration for constraints/RLS.

- [ ] Build WRR create/edit form for CIPL reference, attachment, party, flow, regulatory references, and expected lines.
- [ ] Resolve party/item/category references from authorized server queries; reject stale/inactive/unauthorized references.
- [ ] Validate quantities, UOM, packaging/CBM references, WRR `lot_number`, and required line fields on client and server.
- [ ] Persist staged WRRs and lines without creating lots or receiving ledger transactions.
- [ ] Implement staged-list/detail/search/filter views with capability/scope-safe results.
- [ ] Implement version/stale-edit protection and prevent silent expected-line changes after receiving starts.
- [ ] Generate the approved printable WRR from the server record, including stable reference and physical check-off fields.
- [ ] Test that printing and reopening never imply receipt confirmation.

### 4. Implement floor scan and reconciliation

Testing: Unit matcher tests; Playwright simulated scanner/real IndexedDB; integration tests for server validation.

- [ ] Build the floor receiving route at 375px first using card/list presentation, scanner-ready input, full-width primary action, and solid high-contrast surfaces.
- [ ] Implement start-receiving transition with authorization, current-state validation, and idempotency.
- [ ] Implement barcode-to-item-to-WRR-line matching and accepted/remaining quantity state.
- [ ] Reject wrong WRR, wrong item, unknown item, duplicate, over-quantity, invalid UOM, unresolved lot-context, and (**added 2026-08-10**) flow-type-mismatch scans visibly and recoverably.
- [ ] Provide controlled manual-entry recovery using the same server validation path.
- [ ] Route unknown items to online `06` enrollment or explicit exception; require revalidation after enrollment.
- [ ] Define and implement the approved Tier 1 scan command policy with `03`; do not queue confirmation or enrollment.
- [ ] Preserve local scan state honestly through connectivity loss without marking receipt confirmed.
- ~~[x] **Added 2026-08-10, reopened and re-scoped to per-unit 2026-08-20**: after a `store`-disposition unit's scan matches its expected line, display the system-suggested location(s) (design.md §6.2/§6.2a) before that unit's "Store" action; allow accept-or-override. *(Implemented 2026-08-21: `PutawayLocationSelector` renders all candidates, `suggestPutawayLocations` called with `requestedQty: 1` per unit.)*~~ *(Superseded 2026-08-24: the per-unit commit loop this task described is retired — see Task 6. The substance carries forward into the batch model: `PutawayLocationSelector` and `suggestPutawayLocations` (still called with `requestedQty: 1`) are now invoked once per line, after that line's first accepted scan, and the candidate list still shows every eligible location rather than one recommendation. Design.md §6.2/§6.2a describe the current batch-model shape.)*
- [x] **Added 2026-08-20, re-scoped 2026-08-24**: rework the floor scan UI so the "Store"/"Hold" commit UI appears — and is actionable — as soon as one scan on a line is accepted, not gated behind `scannedQty >= expectedQty` for the whole line (`inspect` lines remain gated on full-line scan completion per design.md §6.3, unchanged). *(Implemented 2026-08-21, reconciled 2026-08-24 for the batch model: `primaryReadyLine`/`readyToCommit` in `app/(authenticated)/receiving/[wrrId]/receive/page.tsx` resolve from `item.scannedQty >= 1 && !isCommitted`; the placement/commit UI for a `store` line is the line's batch placement surface (`PutawayLocationSelector`), not a per-unit form.)*
- ~~[x] **Added 2026-08-20**: implement the per-unit "committed" success state (design.md §6.2) shown after each unit's Store/Hold commit, before the next unit is scanned. *(Implemented 2026-08-21: the commit-success block distinguishes "Unit committed — N / M committed to storage, scan the next unit" from the line's eventual "Line committed" terminal state.)*~~ *(Superseded 2026-08-24: there is no more per-unit commit event to show an interim "unit committed" state for. The current floor UI shows a single per-line "Line committed" success state once the whole line's batch commit succeeds — see `app/(authenticated)/receiving/[wrrId]/receive/page.tsx`'s `commitSuccess` block.)*
- ~~[ ] **Added 2026-08-20, UNRESOLVED, do not implement yet**: the per-unit "Hold" override on an otherwise `store`-disposition line (design.md §6.4) is explicitly blocked on `01-core-data-model`'s amendment/approval process — see Task 1's 2026-08-20 item.~~ *(Superseded 2026-08-24, same reasoning as Task 1's corresponding item — see there. No UI or server work for this item should be built; it is moot, not merely still-blocked.)*

### 5. Implement inbound inspection and discrepancy handling

Testing: Unit state/validation tests; Playwright conformance/non-conformance flows; real-Postgres integration for inspection constraints/RLS.

- [ ] Build inspection/conformance screen tied to WRR and line context.
- [ ] Implement conformance and non-conformance result validation, actor attribution, reason, remarks, evidence, and action fields.
- [ ] Prevent non-conformant stock from becoming available without the approved resolution.
- [ ] Implement private CIPL/evidence attachment flow through the approved Storage boundary.
- [ ] Implement safe exception/attention states and notification/outbox handoff through `04` where required.
- [ ] Ensure inbound inspection states do not reuse or mutate transfer-inspection state from `11`.

### 6. Implement receipt confirmation and putaway handoff

Testing: Unit commit validation; real-Postgres transaction/idempotency/RLS integration; Playwright confirmation/retry flows.

- ~~[x] **Reopened 2026-08-10, supersedes the single-atomic-commit framing below; further reopened and re-scoped to per-unit 2026-08-20**: implement one authoritative commit server command per physical unit for `store`-disposition lines ("Store"), and one per-line command for `inspect`-disposition lines ("Hold"). *(Implemented 2026-08-21: `commitWrrLine` dispatches to `commitStoreUnit`/`commitInspectLine` by disposition.)*~~ *(Superseded 2026-08-24, Product Owner decision — batch model adopted, per-unit model retired: `commitStoreUnit`/`commitInspectLine` and the per-unit dispatch have been deleted. `commitWrrLine` is now the single commit function for both dispositions — one authoritative commit server command per WRR line ("Store" or "Hold"), not one end-of-WRR commit gated on every line being ready, and not a per-unit loop. See Task 6's resolution note below.)*
- [x] **Reopened 2026-08-10, reverses the checked item below** — the 2026-08-09 decision that `store` lines carry an explicit pre-receiving `putaway_location_id` is superseded: `store` lines no longer set `putaway_location_id` at WRR creation/staging. The column (already nullable per migration `0020_wrr_item_putaway_location.sql`; no new migration proposed here) is now populated per line at its single commit, via the suggestion interface in design.md §6.2. `inspect` lines continue to resolve a staff-confirmed active `inspection` location, selected before scanning (design.md §6.3). **Re-interpreted 2026-08-24 (supersedes the 2026-08-20 per-unit wording)**: once a `store` line's batch placement splits across more than one location (design.md §6.2b), this column is left unset rather than holding a "most-recently-used" value — that meaning depended on the now-retired per-unit model. `lot_location_balances` is always the authoritative record.
- ~~[x] Record the Product Owner's 2026-08-09 decision that `store` lines carry an explicit pre-receiving `putaway_location_id`; `inspect` lines resolve the active inspection location. This is a schema amendment owned by `01`, implemented in migration `0020_wrr_item_putaway_location.sql`.~~ *(Superseded 2026-08-10 — see the reopened item immediately above and `specs/00-steering/revision-log.md`. Struck through rather than deleted so the prior decision stays visible in-line, not just in the revision log.)*
- [x] Recheck WRR state, scan totals, conformance, active references, flow partition, lot metadata, and required prerequisites inside the transaction — **per line, for both `store` and `inspect` dispositions** (2026-08-10, re-affirmed 2026-08-24 after the intervening 2026-08-20 per-unit re-scoping was retired).
- [x] Create approved lots/available state and immutable receiving transactions atomically, **per line for both dispositions** (2026-08-10, re-affirmed 2026-08-24): one lot created at the line's single commit; one `lot_location_balances` row and one `inventory_transactions` row per assigned location in that same commit (design.md §9).
- [x] **Reopened 2026-08-10, re-affirmed 2026-08-24 (the 2026-08-20 per-unit re-scoping is retired)**: transition each line to its own terminal committed state in one step (`store` or `inspect`); transition the WRR itself to `confirmed` only once every line has reached that state; return the authoritative result for duplicate retries via the line-scoped `wrr_items.committed_at` idempotency gate.
- [x] Ensure a failed line commit rolls back completely for that line and remains recoverable, without affecting any other line's already-committed state. **Re-affirmed 2026-08-24**: the 2026-08-21 real-Postgres concurrency verification (two races found and fixed — see revision-log.md) was performed against the now-retired per-unit path; it has not yet been re-run against the current batch `commitWrrLine` path specifically — see the outstanding verification item below.
- [x] **Reopened 2026-08-10, re-affirmed 2026-08-24**: integrate the putaway recommendation/suggestion once a line has its first accepted scan (before that line's single "Store" commit), listing every eligible candidate location (design.md §6.2a) rather than one recommendation, using approved locations/capacity interfaces without duplicating location logic.
- ~~[x] **Added 2026-08-20**: implement the create-or-increment `lot_location_balances` write per committed unit (design.md §9 step 4).~~ *(Superseded 2026-08-24: the batch model's placement is known up front, so this is now a plain insert — one `lot_location_balances` row per assigned location in the line's single commit, no upsert/increment logic needed. Implemented in `commitWrrLine`, design.md §9 step 7.)*
- ~~[x] **Added 2026-08-20**: re-scope the per-unit idempotency mechanism (design.md §9) ... *(Implemented 2026-08-21: `commitStoreUnit`'s per-unit idempotency uses a deterministic `transaction_number` derived from `sha256(wrrItemId:idempotencyKey)` ...)*~~ *(Superseded 2026-08-24: the per-unit idempotency-key mechanism is deleted along with `commitStoreUnit`. Idempotency reverts to the single `wrr_items.committed_at` `NULL → non-NULL` conditional-claim gate, scoped to the whole line, unchanged in mechanism from before 2026-08-20 — see design.md §9.)*
- [x] Record completed putaway through the owning inventory transaction boundary.
- [x] **Added 2026-08-10**: implement the flow-type cross-check rejection (design.md §6.1) — a scanned item's `items.flow_type` must match the WRR's `wrr_documents.flow_type`, rejected through the existing wrong-item exception path. Unaffected by the 2026-08-24 batch-model decision.
- [x] **Added 2026-08-10**: implement the location-first "Hold" sequence for `inspect`-disposition lines (design.md §6.3) — confirm inspection location, then scan, then commit. *(Verified 2026-08-21 against real Postgres for the then-current model.)* **Note added 2026-08-24**: `recordScan` has since been reverted to unconditionally increment `wrr_items.scanned_qty` for every disposition (store and inspect alike), restoring its pre-2026-08-20 behavior — the store-disposition skip introduced 2026-08-20 (because per-unit commits were meant to be the sole writer of that column) no longer applies, since there is no per-unit commit path left to own it. This still needs its own real-Postgres re-verification pass, not assumed from the 2026-08-21 result alone — see the outstanding verification item below.
- ~~[ ] **Added 2026-08-20, UNRESOLVED, do not implement yet**: the per-unit "Hold" override on an otherwise `store`-disposition line (design.md §6.4, requirements.md R3.12) is explicitly blocked on `01-core-data-model`'s amendment/approval process — see Task 1's 2026-08-20 item.~~ *(Superseded 2026-08-24, same reasoning as Task 1's corresponding item — moot, not merely still-blocked. See design.md §6.4, requirements.md §5a Item 2/4.)*
- [x] **Added 2026-08-23/24, resolved 2026-08-24**: insert one `inventory_units` row (`lib/db/schema/inventory_units.ts`) per physical box, at the same line commit that already writes `lot_location_balances`/`inventory_transactions` (design.md §9 step 8), using each box's assigned identity (`deriveWrrUnitId`, `lib/barcode/wrr-unit.ts`) and its assigned `location_id`. This is what `08-outgoing-withdrawal-and-two-stage-commitment` requirements.md R3.3's exact-box dispatch scan (2026-08-24) reads against. **Confirmed by reading the current `lib/actions/receiving.ts` directly**: `commitWrrLine`'s single insert loop over `committedUnitLocations` performs this for both `store` and `inspect` dispositions (status `available`/`quarantined` respectively) — this is no longer a separate open item referencing a per-unit commit path; it is satisfied by the batch commit's own insert.
- [x] **Added 2026-08-24, RESOLVED — Product Owner decision: batch model adopted, per-unit model retired.** The genuine unresolved contradiction between the `fix-it-felix` batch putaway proposal (requirements.md R2a, design.md §9) and the then-current per-unit scan-suggest-commit model has been resolved in favor of the batch model. `lib/actions/receiving.ts`'s prior unresolved merge-conflict markers have been reconciled: `commitWrrLine` is the sole commit function, accepting a single `locationId` or a batch placement (`allocations`/`unitLocationIds`) plus `presenceAttested`. The four batch-specific sub-items originally proposed are resolved as follows:
  - [x] `wrr_item_putaway_allocations` migration/schema/RLS exists and is live (migration `0032_wrr_item_putaway_allocations.sql`): enforces positive `qty` (CHECK constraint), one row per line/location pair (UNIQUE constraint), and RLS gated on `receiving.confirm`/`receiving.view`. Server-side validation of "allocation total equals expected quantity" and per-location CBM fit is enforced in `commitWrrLine` at commit time, not in the migration itself.
  - [x] Batch putaway UI is built: `PutawayLocationSelector.tsx` presents a "Put all N boxes in [location]" single-location quick action plus a collapsible "Split or adjust individual boxes" per-box location assignment, a placement summary showing current/projected CBM and stored contents, a required presence-attestation checkbox, and one primary "Store all N boxes" command. The individual-label scan path remains available ("Verify another carton individually").
  - [~] "Hold All" for `inspect` lines is only partially as originally proposed: the shipped UI keeps `inspect` lines on the existing location-first, single-location "Hold" sequence (design.md §6.3) with **no presence attestation and no multi-location split**, since `inspect` lines never batch across locations — this is a deliberate simplification, not an oversight, but it does deviate from the original sub-item's literal wording ("require the same attestation for `inspect` lines"). Flagged here so the deviation is visible rather than silently marked identical to the proposal.
  - [x] Commit posts one `lot_location_balances` row and one `inventory_transactions` row per storage allocation atomically, in one transaction, gated by the line-scoped `wrr_items.committed_at` idempotency claim. **Still not proven under real-Postgres retry/concurrency testing for this specific batch code path** — the mocked-db validation defect that would have blocked this (below) is fixed, but the 2026-08-21 real-Postgres concurrency verification was performed against the now-retired per-unit path and has not been re-run against batch `commitWrrLine`; that re-run still needs `db-migration-verifier` or an environment with real Postgres access (none available in the environment that made this fix).
- [x] **Added 2026-08-24, RESOLVED same day (code fix, not just documentation)**: `lib/receiving/commit-validation.ts`'s `validateLineCommit` had not been reconciled to the batch model — it still encoded the retired per-unit model's `store`-disposition gate (`scannedQty >= expectedQty` rejected as "already fully committed"), which `commitWrrLine`'s batch path (calling it with `scannedQty` forced equal to `expectedQty`) would have always failed. Root cause: `fix-it-felix` never touched this file after diverging, so git's auto-merge silently kept `v1`'s stale per-unit version with no conflict marker to catch it. Fixed by replacing both `commit-validation.ts` and its test file wholesale with `fix-it-felix`'s versions (same pattern as this merge's other retired-per-unit files) — `fix-it-felix`'s version already had the correct disposition-uniform "under-scanned blocks commit" check with no per-unit "already fully committed" branch. `npx tsc --noEmit` and the full `npx vitest run` (1894 tests) are clean. See `specs/00-steering/revision-log.md`'s 2026-08-24 "`commit-validation.ts` batch-model defect... fixed in code" entry for the full account.

**2026-08-20 amendment implementation (completed 2026-08-21) — superseded 2026-08-24.** The per-unit implementation this note originally described (`commitStoreUnit`, per-unit idempotency, per-unit floor UI states) has been deleted from the codebase per the Product Owner's 2026-08-24 batch-model decision. Retained here as a historical record only, not as a description of current code: `lib/receiving/commit-validation.ts` validated one unit's readiness at a time for `store` lines; `commitWrrLine` dispatched to `commitStoreUnit`/`commitInspectLine`; the floor UI showed the Store/Hold action per unit via a `wrrItemId` search param; `suggestPutawayLocations` was called with `requestedQty: 1` per unit. See `specs/00-steering/revision-log.md`'s 2026-08-21 and 2026-08-24 entries for the full account.

**Merge reconciliation note (2026-08-24), RESOLVED**: the batch-putaway sub-items originally proposed on the `fix-it-felix` branch are resolved above, checked off where implemented and confirmed against the real current code, with one exception explicitly flagged rather than silently checked: the `inspect`-line "Hold All"/attestation deviation. The other flagged item, `commit-validation.ts`'s stale per-unit validation gate, has since been fixed in code the same day — see above and `specs/00-steering/revision-log.md`'s 2026-08-24 entries for the full account of the Product Owner decision and the follow-up fix.

### 7. Implement incoming ledger and review

Testing: Unit query/filter tests; real-Postgres RLS/query-plan integration; Playwright review/filter/detail flows.

- [ ] Implement a read-only Incoming Ledger query over `inventory_transactions` for receiving/putaway movements.
- [ ] Add date, party, flow, item/code, WRR/CIPL, and authorized status filters.
- [ ] Display item-first columns and authorized WRR/lot/party/user/location/conformance context.
- [ ] Add safe detail view/modal without exposing out-of-scope records.
- [ ] Verify corrections are represented by new transactions, never updates/deletes.

### 8. Integration, review, and documentation

Testing: Full applicable matrix below.

- [ ] Mount all routes through `05` and document office/floor shell contracts.
- [ ] Document the interface used by `06` for unknown-item recovery and by future putaway/inspection features.
- [ ] Add a negative test proving CIPL staging, item enrollment, confirmation, and putaway confirmation cannot enter the offline queue.
- [ ] Run `offline-sync-reviewer`, `rbac-rls-reviewer`, `db-migration-verifier`, and `design-system-auditor` before sign-off.
- [ ] Update `specs/00-steering/gantt-mapping.md` when this spec changes status.

## Testing matrix

### Unit tests (Vitest)

- [ ] WRR/line validation, status transitions, quantity reconciliation, UOM, and discrepancy rules.
- [ ] Barcode matcher behavior and duplicate/over-quantity/unknown-item rejection.
- [ ] Conformance/non-conformance validation and required evidence/reason rules.
- [ ] Receipt commit precondition and idempotency result handling. **Re-scoped 2026-08-20, then again 2026-08-24 (batch model adopted, per-unit retired); `commit-validation.ts` itself fixed 2026-08-24 (see above and revision-log.md)**: `lib/receiving/__tests__/commit-validation.test.ts` is now correctly reconciled to the batch model — it tests `validateLineCommit`'s disposition-uniform scan-completeness gate, not a per-unit contract. What's still thin: `validateLineCommit` never owned the batch-specific preconditions (allocation total equals `expected_qty`, presence attestation required for a multi-slot placement, per-location CBM fit) — those live inline in `commitWrrLine` (`lib/actions/receiving.ts`) itself, and mocked-db coverage for their rejection paths (`presence_attestation_required`, `allocation_qty_must_equal_expected`) is currently thin-to-absent in `lib/actions/__tests__/receiving.test.ts`; only one positive-path batch case exists in the real-Postgres `receiving.commit-line.integration.test.ts`, which could not be run in the environment that made this pass (no live `DATABASE_URL`). Still open.
- [ ] Incoming ledger filter/query parameter validation.

### Integration tests

- [x] Apply the complete migration chain in real Postgres and verify WRR/line/inspection/lot/transaction constraints. *(Verified 2026-08-21, disposable Postgres container; migration `0030_cipl_documents_storage.sql`'s Supabase Storage RLS behavior specifically remains unverified against real Supabase Storage semantics — only its DDL was confirmed against a hand-built `storage.buckets`/`storage.objects` stand-in, same caveat as this file's existing `auth.jwt()` stand-in.)*
- [ ] Verify staged WRRs create no active lots or receiving transactions.
- [ ] Verify authorized receipt commit atomically creates the approved lots and immutable receiving transactions exactly once. **Re-scoped 2026-08-20, then again 2026-08-24 (batch model adopted, per-unit retired)**: for `store` lines, verify this holds per line — one lot created at the single commit; one `lot_location_balances` row and one `inventory_transactions` row per assigned location; one `inventory_units` row per physical box — and verify a line whose batch placement splits across more than one location ends up with the correct multiple `lot_location_balances` rows for one lot. The 2026-08-21 "17/17 real-Postgres integration tests" result (`lib/actions/__tests__/receiving.commit-line.integration.test.ts`) verified the now-retired per-unit path and needs to be re-run/rewritten against the current `commitWrrLine` batch path before this can be re-checked — not yet done.
- [ ] Verify failed commit rolls back and duplicate retries return one authoritative outcome. **Re-scoped 2026-08-20, then again 2026-08-24 (batch model adopted, per-unit retired)**: for `store` lines, verify this at line-commit granularity — a failed or retried line commit does not affect any other already-committed line. The 2026-08-21 concurrency verification (two real races found and fixed, stress-tested to 9-10 concurrent calls — see revision-log.md) was performed against the now-retired per-unit path; it needs re-verification against the current batch `commitWrrLine` path, which has not yet been done. The `commit-validation.ts` defect that previously would have blocked this verification from even passing is fixed as of 2026-08-24 (see above) — this item's remaining blocker is purely the lack of real-Postgres access to actually run the re-verification, not a known code defect.
- [ ] Verify default-deny RLS and party/flow scope for WRR, inspection, attachment, lot, and ledger access.
- [ ] Verify revoked/deactivated users cannot start, confirm, or replay receiving work.
- [ ] Verify incoming ledger uses transaction records and cannot mutate history.

### E2E tests (Playwright)

- [ ] Create/edit/stage/print a WRR without inventory side effects.
- [ ] Start receiving and simulate scanner keyboard input against expected lines.
- [ ] Verify wrong, duplicate, over-quantity, unknown, and manually recovered scans.
- [ ] Verify unknown item routes to authorized online enrollment/exception and requires rescan/revalidation.
- [ ] Verify inbound conformance and non-conformance flows, evidence, and blocked commit.
- [ ] Confirm receipt, reload/retry, and verify no duplicate outcome.
- [ ] Verify offline scan capture behavior and that confirmation/enrollment remain unavailable offline.
- [ ] Verify batch allocation supports boxes placed in different locations, rejects an allocation total that differs from expected quantity, rejects over-capacity/stale/wrong-type locations, and does not mutate unique QR payloads or require printed-label order.
- [ ] Verify Incoming Ledger filters, detail access, mobile/floor and office layouts, focus, contrast, touch targets, and reduced motion.

### Manual QA

- [ ] Verify printed WRR content and physical check-off usability.
- [ ] Verify scan feedback and one-primary-action behavior on representative handheld viewport.
- [ ] Verify private CIPL/evidence links, safe errors, and no protected-data leakage.
- [ ] Physical scanner/dead-zone/fully closed-app backgrounding QA is deferred to the project-wide pre-launch hardware pass unless risk requires earlier validation.

## Sign-off

- [x] `01-core-data-model` tables/transitions are approved and reconciled.
- [x] RBAC/RLS review passes for the documented receiving and advance-notice authorization boundary; the controlled function independently checks `receiving.confirm`.
- [ ] Offline Tier 1 scan boundary and Tier 2 denylist are approved.
- [ ] All applicable tests pass, including real-Postgres verification.
- [ ] Design-system and print/physical workflow reviews pass.
- [x] Product owner approval — Name: User / System Date: 2026-08-06
- [x] Second approver approval — Name/Role: User / System (auto-sign-off per standing instruction) Date: 2026-08-06
- [x] Batch putaway allocation amendment approval — Product owner: User, 2026-08-20
- [x] Batch putaway allocation amendment approval — Second approver: System (standing auto-sign-off), 2026-08-20
<<<<<<< HEAD
- [x] Batch-vs-per-unit contradiction resolution (batch model adopted, per-unit model retired) — Product owner: User, 2026-08-24
- [x] Batch-vs-per-unit contradiction resolution (batch model adopted, per-unit model retired) — Second approver: System (standing auto-sign-off), 2026-08-24
=======
- [x] WRR document-field amendment approval — Product owner: Granted in conversation, 2026-08-24
- [x] WRR document-field amendment approval — Second approver: Granted in conversation, 2026-08-24
>>>>>>> origin/fix-it-felix
