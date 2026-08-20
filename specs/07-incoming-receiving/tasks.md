# Incoming Receiving — Implementation Plan

Status: Approved
Updated: 2026-08-20

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
- [ ] **Added 2026-08-20, NOT resolved — blocked on `01-core-data-model`'s own amendment/approval process**: the Product Owner's per-unit "Hold" override on an otherwise `store`-disposition line (design.md §6.4, requirements.md R3.12/§5a Item 2) has no representation under the current schema (one `lots.status` per WRR line). Candidate resolutions are described neutrally in design.md §6.4 — (a) two `lots` rows sharing one `lot_number`, differentiated by disposition/status, or (b) moving quarantine/status tracking to a finer grain than the lot row — but neither is chosen here; this is `01`'s call, not `07`'s. **Do not implement this specific override until `01` resolves it.** The rest of the 2026-08-20 amendment (per-unit commit loop, multi-candidate location list, multi-location split) does not depend on this and is reopened separately below (Tasks 4 and 6).
- [x] Finalize whether CIPL remains an attached reference plus manually encoded `wrr_items`, or whether structured CIPL parsing is required. — Confirmed: CIPL is an attached external reference stored privately; structured parsing is not in scope for v1 (design.md §5).
- [x] Finalize expected-line fields, scan/reconciliation storage, inspection-log fields, discrepancy states, and lot inheritance rules. — Expected-line field table added (design.md §5.1); discrepancy states defined (§5.2); inspection-log fields confirmed from `01` schema; `lot_number` confirmed as the single canonical identifier inherited verbatim at commit.
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
- [ ] **Added 2026-08-10, reopened and re-scoped to per-unit 2026-08-20**: after a `store`-disposition unit's scan matches its expected line, display the system-suggested location(s) (design.md §6.2/§6.2a) before that unit's "Store" action; allow accept-or-override. The 2026-08-10 item described this happening once for the whole line's full scanned quantity; it now happens once per individually scanned unit, and the suggestion list must show every eligible candidate location, not one recommendation.
- [ ] **Added 2026-08-20**: rework the floor scan UI so the "Store"/"Hold" commit UI appears — and is actionable — as soon as a single unit is scanned, not gated behind `scannedQty >= expectedQty` for the whole line. `app/(authenticated)/receiving/[wrrId]/receive/page.tsx` currently gates this behind full-line scan completion; this must change to per-unit.
- [ ] **Added 2026-08-20**: implement the per-unit "committed" success state (design.md §6.2) shown after each unit's Store/Hold commit, before the next unit is scanned.
- [ ] **Added 2026-08-20, UNRESOLVED, do not implement yet**: the per-unit "Hold" override on an otherwise `store`-disposition line (design.md §6.4) is explicitly blocked on `01-core-data-model`'s amendment/approval process — see Task 1's 2026-08-20 item. No UI or server work for this specific override should be built until that item is resolved.

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

- [ ] **Reopened 2026-08-10, supersedes the single-atomic-commit framing below; further reopened and re-scoped to per-unit 2026-08-20**: implement one authoritative commit server command per physical unit for `store`-disposition lines ("Store"), and one per-line command for `inspect`-disposition lines ("Hold") — not one end-of-WRR commit gated on every line being ready, and not (for `store`) one end-of-line commit gated on every unit being scanned first. The 2026-08-10 item's "per-line" framing for `store` lines is superseded; `inspect` lines are unaffected (still per-line, design.md §6.3/§9).
- [ ] **Reopened 2026-08-10, reverses the checked item below** — the 2026-08-09 decision that `store` lines carry an explicit pre-receiving `putaway_location_id` is superseded: `store` lines no longer set `putaway_location_id` at WRR creation/staging. The column (already nullable per migration `0020_wrr_item_putaway_location.sql`; no new migration proposed here) is now populated per line at scan/store time, via the suggestion interface in design.md §6.2. `inspect` lines continue to resolve a staff-confirmed active `inspection` location, now selected before scanning rather than only at commit (design.md §6.3). **Further re-interpreted 2026-08-20**: once a `store` line's units split across more than one location (design.md §6.2b), this column holds only the most-recently-used location, not the authoritative record — see the new item below.
- ~~[x] Record the Product Owner's 2026-08-09 decision that `store` lines carry an explicit pre-receiving `putaway_location_id`; `inspect` lines resolve the active inspection location. This is a schema amendment owned by `01`, implemented in migration `0020_wrr_item_putaway_location.sql`.~~ *(Superseded 2026-08-10 — see the reopened item immediately above and `specs/00-steering/revision-log.md`. Struck through rather than deleted so the prior decision stays visible in-line, not just in the revision log.)*
- [ ] Recheck WRR state, scan totals, conformance, active references, flow partition, lot metadata, and required prerequisites inside the transaction — **per-unit for `store` lines, per-line for `inspect` lines** (2026-08-10, re-scoped 2026-08-20).
- [ ] Create approved lots/available state and immutable receiving transactions atomically, **per unit for `store` lines** (lot created once per line, on the first committed unit, and reused for every subsequent unit — design.md §9), **per line for `inspect` lines** (2026-08-10, re-scoped 2026-08-20).
- [ ] **Reopened 2026-08-10, re-scoped 2026-08-20**: transition each `store`-disposition unit to a terminal committed state independently (each `inspect`-disposition line remains a single terminal-state transition, unchanged); transition the parent line to its own terminal committed state only once every one of its expected units is terminal; transition the WRR itself to `confirmed` only once every line has reached that state; return the authoritative result for duplicate retries per unit-commit event (per line for `inspect`).
- [ ] Ensure a failed `store`-disposition unit commit rolls back completely for that unit and remains recoverable, without affecting any other unit's — on the same line or any other line's — already-committed state (2026-08-10, re-scoped 2026-08-20 from "per-line" to "per-unit" for `store` lines).
- [ ] **Reopened 2026-08-10, moves earlier in the flow; re-scoped 2026-08-20**: integrate the putaway recommendation/suggestion at each unit's scan time (before that unit's "Store" commit), listing every eligible candidate location (design.md §6.2a) rather than one recommendation, using approved locations/capacity interfaces without duplicating location logic — not only as a post-commit recommendation, and not batched once per line.
- [ ] **Added 2026-08-20**: implement the create-or-increment `lot_location_balances` write per committed unit (design.md §9 step 4) — insert a new row if this lot has no existing balance row at the chosen location yet, otherwise increment the existing row's `qty_received`/`qty_remaining` by one unit. This is the mechanism that makes design.md §6.2b's multi-location split work; no `01-core-data-model` migration is needed for it.
- [ ] **Added 2026-08-20**: re-scope the per-unit idempotency mechanism (design.md §9) — `wrr_items.committed_at` now marks only the line's full terminal completion (all expected units committed), not a single line-level commit event; each individual unit-commit's own idempotency uses the general command idempotency-key mechanism (design.md §4), not `committed_at`. Confirm the existing `wrr_items_protect_committed_at` trigger (migration `0022_receiving_inventory_insert_policies.sql`) still correctly protects this re-scoped meaning (it should, since it was already a one-time `NULL → non-NULL` guard).
- [ ] Record completed putaway through the owning inventory transaction boundary.
- [ ] **Added 2026-08-10**: implement the flow-type cross-check rejection (design.md §6.1) — a scanned item's `items.flow_type` must match the WRR's `wrr_documents.flow_type`, rejected through the existing wrong-item exception path.
- [ ] **Added 2026-08-10**: implement the location-first "Hold" sequence for `inspect`-disposition lines (design.md §6.3) — confirm inspection location, then scan, then commit. Unaffected by the 2026-08-20 per-unit amendment (still whole-line).
- [ ] **Added 2026-08-20, UNRESOLVED, do not implement yet**: the per-unit "Hold" override on an otherwise `store`-disposition line (design.md §6.4, requirements.md R3.12) is explicitly blocked on `01-core-data-model`'s amendment/approval process — see Task 1's 2026-08-20 item. No commit-path work for this specific override should be built until that item is resolved.

**Already-shipped files needing follow-up rework for the 2026-08-20 amendment (not done in this document-only pass)**, in addition to those already listed against the 2026-08-10 reversal above:

- `lib/receiving/commit-validation.ts` — `validateCommit` currently validates a whole line's readiness at once (already reworked once for the 2026-08-10 per-line model); needs a further rework to validate one unit's readiness at a time for `store` lines.
- `lib/actions/receiving.ts`'s `commitWrrLine` — currently commits a line's full `scannedQty` in one shot to one `locationId` (per the 2026-08-10 model); needs to accept and commit one unit at a time to one location per call, with the create-or-increment `lot_location_balances` logic described above.
- `app/(authenticated)/receiving/[wrrId]/receive/page.tsx` — currently gates the Store/Hold UI behind `scannedQty >= expectedQty` (the whole line must be fully scanned first); needs to show the Store/Hold action per unit as soon as that unit is scanned.
- `lib/db/queries/locations.ts`'s `suggestPutawayLocations` — already returns an array of candidates (`PutawayCandidate[]`) and the UI already renders them in a `<select>`, so this query's own contract may need little or no change; confirm it is being called per-unit rather than once per line-batch, and that its candidate list already reflects capacity already consumed by earlier units of the same line within the same receiving session.
- `lib/receiving/scan-matcher.ts` — not expected to need changes for the per-unit commit loop itself (matching logic is unchanged; only what happens after a match changes), but should be checked once the per-unit Hold override (§6.4) is eventually resolved by `01`, since that override may need the matcher to expose a per-unit escape-hatch action alongside the existing per-line disposition.

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
- [ ] Receipt commit precondition and idempotency result handling. **Re-scoped 2026-08-20**: for `store` lines, this now means per-unit precondition/idempotency handling (one unit's commit at a time), plus the create-or-increment `lot_location_balances` logic (design.md §9); `inspect` lines keep the existing per-line test shape.
- [ ] Incoming ledger filter/query parameter validation.

### Integration tests

- [ ] Apply the complete migration chain in real Postgres and verify WRR/line/inspection/lot/transaction constraints.
- [ ] Verify staged WRRs create no active lots or receiving transactions.
- [ ] Verify authorized receipt commit atomically creates the approved lots and immutable receiving transactions exactly once. **Re-scoped 2026-08-20**: for `store` lines, verify this holds per unit (one lot created on the first unit, reused thereafter; one `lot_location_balances` row created or incremented per unit's location; one `inventory_transactions` row per unit) and verify a line whose units split across more than one location ends up with the correct multiple `lot_location_balances` rows for one lot.
- [ ] Verify failed commit rolls back and duplicate retries return one authoritative outcome. **Re-scoped 2026-08-20**: for `store` lines, verify this at unit-commit granularity — a failed or retried unit-commit does not affect any other already-committed unit, on the same line or a different one.
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
