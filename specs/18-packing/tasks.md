# Packing — Implementation Plan

Status: Draft

## Implementation gate

No packing tables/migrations, routes, scan handlers, package-label generation, packing jobs, or dispatch handoff code may be implemented until `requirements.md` and `design.md` are approved, the `01`/`08`/`10`/`19` contracts are reconciled, and both sign-offs below are complete. Planning documentation is permitted while this feature remains Draft; application code is not.

## Dependencies and aligned boundaries

- `01` owns canonical entities, pick-list schema, locations/lots, and immutable ledger rules.
- `02` owns capabilities, party/flow scope, RLS, audit, and approval authority.
- `03` owns the offline observation/replay boundary; authoritative packing is online-only.
- `04` owns Auth, transactions/idempotency, jobs, private Storage, labels, monitoring, and retries.
- `05` owns authenticated routes and shared responsive/floor shell patterns.
- `08` owns commitment, source pick state, physical pick/dispatch, inventory decrement, exceptions, and final `pick` transaction.
- `10` owns priced `pick_list`/`acknowledgement_receipt` snapshots, artifacts, printing, and reprinting.
- `12`/`13` own VMI billing and Trading pricing semantics.
- `19` owns dispatch scheduling, delivery status, and post-packing handoff.

## 1. Resolve packing policy and source contract

Testing: warehouse operations, dispatch, finance, privacy, and product review; revision-log update.

- [ ] Confirm the exact `08` source eligibility state and whether packing is mandatory for each outbound flow/type.
- [ ] Decide final packing-session/package/line/exception persistence ownership and schema with `01`.
- [ ] Define package types, sequence/reference format, dimensions, weight units, seals, labels, and retention.
- [ ] Decide whether package fields appear on the acknowledgement receipt and which fields `10` may consume.
- [ ] Define partial packing, shortage, damage, wrong-lot, reopen, repack, cancellation, and post-seal correction policy.
- [ ] Define whether packaging materials are inventory-controlled and, if so, the owning consumption workflow.
- [ ] Decide whether scan observations enter the `03` Tier 1 queue and document exact replay/idempotency behavior.
- [ ] Define capabilities, supervisor/approval boundaries, party-safe fields, audit retention, and dispatch handoff semantics.
- [ ] Record decisions in `specs/00-steering/revision-log.md`.

## 2. Reconcile source, schema, and event contracts

Testing: cross-feature schema/event review; `db-migration-verifier`; real-Postgres plan.

- [ ] Reconcile `pick_lists`/`pick_list_items` status and source-version fields with `08` and `01`.
- [ ] Define typed source snapshot and packing-ready event contracts for `08`, `10`, and `19`.
- [ ] Define packing session/package/line/exception indexes, unique constraints, lifecycle/version fields, and RLS ownership.
- [ ] Define accepted-quantity/package-assignment invariants and concurrency behavior.
- [ ] Confirm no packing operation creates a second inventory ledger, reservation model, priced document, or dispatch state machine.
- [ ] Confirm no schema introduces `warehouse_id`, `withdrawal_slip`, `awaiting_pricing`, or non-canonical movement terminology.

## 3. Implement authorization-safe packing commands

Testing: unit command tests; real-Postgres RLS/concurrency tests; `rbac-rls-reviewer` review.

- [ ] Add approved packing capabilities and source/party/flow scope checks to the RBAC catalog.
- [ ] Implement idempotent session open/reopen/cancel and source-version validation.
- [ ] Implement scan acceptance with server-side item/barcode, lot, quantity, UOM, duplicate, and stale-state checks.
- [ ] Implement package assignment/close invariants and approved dimensions/weight validation.
- [ ] Implement explicit exception creation/resolution and route business corrections to `08`/approval ownership.
- [ ] Add audit events for scans, rejections, package changes, exceptions, seal, reopen, cancel, handoff, and failures.

## 4. Build floor packing workflow

Testing: Playwright floor flow; hardware/scanner simulation; accessibility and manual QA.

- [ ] Build one-task-per-screen portrait flow at the approved handheld baseline.
- [ ] Focus scanner input on load and preserve it through safe feedback; keep manual entry as controlled recovery.
- [ ] Show source pick-list, item code/barcode, lot, expected quantity/UOM, flow, package assignment, and current status clearly.
- [ ] Provide immediate recoverable feedback for wrong item/lot/source, duplicate, over/under quantity, UOM, and stale source scans.
- [ ] Build package assignment, package review, exception, seal, and ready-for-dispatch states with one primary action per screen.
- [ ] Distinguish local observation, server-accepted, packed, sealed, ready, and dispatched states; never use color alone.

## 5. Build office review, labels, and handoff

Testing: Playwright responsive review; integration tests with `10`/`19`; label/print manual QA.

- [ ] Build authorized office packing history and package/exception review with responsive tables and safe filters.
- [ ] Implement approved internal package labels without creating a competing priced document.
- [ ] Consume immutable `10` document snapshots for any preview/print link and preserve Trading/VMI pricing semantics.
- [ ] Emit the versioned packed-ready event to `19` and approved `08`/`10` consumers with retry/idempotency.
- [ ] Verify a handoff or document failure does not reverse packing history or claim dispatch completion.

## 6. Implement offline/realtime/failure behavior

Testing: offline replay, reconnect, duplicate/lost-response, job retry, and outage tests.

- [ ] If approved, register only physical scan observations in the `03` Tier 1 queue with minimum data and no completion authority.
- [ ] Reauthenticate/re-authorize/revalidate source version and quantities on replay; reject stale or duplicate observations safely.
- [ ] Keep session/package mutations, exceptions, sealing, labels, and dispatch-ready confirmation online-only.
- [ ] Add Realtime invalidation plus reconnect/manual authoritative refetch.
- [ ] Add visible stale/offline/error/attention states and operator-observable retry/dead-letter behavior.

## 7. End-to-end verification and approval readiness

- [ ] Verify valid committed/picked source eligibility and all VMI/Trading/Supplies quantity boundaries.
- [ ] Verify package assignment cannot duplicate, omit, or exceed accepted quantity.
- [ ] Verify packing does not decrement inventory, release reservations, alter prices, generate final receipts, or commit dispatch.
- [ ] Verify `08` owns final `pick` transaction, `10` owns document artifacts, and `19` owns scheduling/delivery.
- [ ] Verify no cross-party/flow discovery through packing lists, package labels, counts, filters, errors, events, or URLs.
- [ ] Verify offline/stale/replay, concurrency, idempotency, exception, accessibility, and floor hardware behavior.
- [ ] Run Vitest, real-Postgres, integration/job, Playwright, manual, and reconciliation checks.

## Sign-off

- [ ] Packing policy, schema, source eligibility, package/label fields, exception rules, and offline policy approved.
- [ ] `01`, `08`, `10`, and `19` contracts reconciled and versioned.
- [ ] `02`, `03`, and `04` authorization/offline/infrastructure contracts verified.
- [ ] Tests, privacy, accessibility, hardware simulation, and operational QA pass.
- [ ] Product/operations approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
