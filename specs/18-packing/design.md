# Packing — Design

Status: Draft

## 1. Design intent

`18` is a verification and handoff projection around the outbound pick. It turns an authoritative pick-list snapshot into an auditable set of accepted packing lines and package/container records, then emits a packing-ready event for dispatch scheduling and final dispatch execution.

It is deliberately not a second allocation or inventory engine. The source pick list, lot quantities, reservation, final price, and dispatch result remain owned by `08`, `10`, and the approved pricing boundaries.

## 2. Foundational dependencies and ownership

Depends on `00-steering` for product, technology, structure, testing, and floor-priority design; `01` for canonical parties/items/locations/lots/pick lists and immutable transactions; `02` for capabilities, party/flow scope, RLS, and audit; `03` for offline/replay boundaries; `04` for Auth, transaction/idempotency, jobs, labels, Storage, and telemetry; `05` for routes/shell; `08` for committed pick source, pick execution, exceptions, and final dispatch; `10` for immutable priced documents and artifacts; `12`/`13` for pricing semantics; and `19` for dispatch/delivery handoff.

### Source and feature-owned data

| Data | Role in `18` | Owner |
|---|---|---|
| `pick_lists`, `pick_list_items` | Read the committed/picked source snapshot and expected lines. | `08`/`01` workflow contract. |
| `parties`, `items`, `lots`, `locations` | Resolve authorized labels and operational context. | `06`/`01`; current RLS applies. |
| Packing session/package records | Accepted packing lines, packages, measurements, status, versions, and exceptions. | `18`, schema location to be approved. |
| `inventory_transactions` | Read final dispatch reference only. | `08`/core; never mutated by `18`. |
| Generated documents/artifacts | Read/link approved pick-list/receipt artifacts and internal label artifacts if approved. | `10`/`04`; `18` cannot replace them. |

## 3. Provisional logical model

The final schema must be approved before implementation. The logical model is:

```text
packing_sessions
  id, source_pick_list_id, source_version/event_id,
  party/flow context, status, opened_by, opened_at,
  confirmed_by, confirmed_at, correlation/idempotency data

packing_packages
  id, packing_session_id, package_reference, sequence,
  package_type, dimensions/weight fields, seal/reference,
  status, label/artifact reference, created/closed timestamps

packing_lines
  id, packing_session_id, source_pick_list_item_id,
  item/lot/location snapshot, expected/accepted quantity,
  uom, package_id, scan evidence/reference, status

packing_exceptions / packing_events
  type/reason, source/version, actor/executor, status,
  resolution, timestamp, correlation/reference
```

This is a logical boundary, not permission to add tables while the spec is Draft. `01` must decide whether any fields belong in the core model, whether package records need private Storage, and how foreign keys/retention/RLS are represented.

## 4. Source-to-packing flow

```text
08 committed/picked pick_list snapshot
  -> 18 opens packing session with source version
  -> packer scans pick list/item/lot and accepts verified quantity
  -> accepted lines assigned to package/container records
  -> exceptions resolved or routed to owner
  -> online seal/packing confirmation
  -> versioned packed-ready event to 19 and relevant 08/10 consumers
  -> 19 schedules/handoffs; 08 commits final dispatch
  -> 08 writes inventory_transaction(pick) and 10 generates acknowledgement_receipt
```

The packing confirmation does not mean the goods were handed to the party. `19` may reject or delay scheduling; `08` remains authoritative for final dispatch and inventory decrement.

## 5. Scan, quantity, and package invariants

The server validates every accepted line against the source snapshot and current authorization. It checks source pick-list identity/version, item barcode/code, lot, expected location/context, flow type, quantity/UOM, and duplicate assignment. The client may display running totals, but the server owns accepted quantity.

Package assignment is a one-to-many mapping from a source line to packages, with a uniqueness/invariant preventing accepted quantity from exceeding the source quantity or being assigned twice. Package close requires all required lines and measurements, plus approved exception resolution. If partial packing is allowed, it must be represented explicitly and handed off with a status that `19` and `08` understand; it must not masquerade as complete packing.

Measurements are descriptive logistics data unless a future approved contract makes them authoritative for pricing, billing, capacity, or delivery. `18` does not infer CBM billing or Trading price from package measurements.

## 6. Exceptions, reopen, and history

Every rejection and exception records the source version, observed values, reason, actor, and correlation ID. A correction is a new event/version linked to the prior one. A packed/sealed history is not edited in place. Reopen/repack is a separate authorized command that rechecks whether `08` has dispatched or otherwise made the source immutable.

Shortage, damage, or lot mismatch is handed to the approved `08` exception/reconciliation path. `18` may block packing and show the next owner, but cannot change lot balances, reserve state, pricing, approval, or ledger history.

## 7. Authorization, privacy, and offline behavior

The effective access rule is:

```text
current capability
  + source pick-list access
  + party/flow scope
  + current source/version state
  + RLS and package/label field policy
```

The floor command is online-authoritative. A permitted Tier 1 scan-observation queue, if approved by `03`, stores only the minimum observation and never a completion result. Replay must reauthenticate, reauthorize, revalidate the source/version and quantity, and use an idempotency key. Offline UI distinguishes local observation from server acceptance, packing seal, and dispatch.

Realtime is an invalidation signal. Reconnect/manual refresh refetches the source pick list and packing session under current authorization.

## 8. UI and interaction design

Active packing uses a 375–430px portrait baseline, 16px floor padding, solid surfaces, minimum 16px text, 56px touch targets, and a 64px full-width primary action. The flow is scan > tap > type, with one task and one primary next action per screen. Status uses text/icons plus semantic color; color alone is never used.

Office review may show package tables, exception history, measurements, and dispatch readiness. It remains responsive and uses the approved fonts/tokens. Scanner focus must not be stolen by decorative UI, and loading/error/stale/offline states must not be confused with accepted packing state.

## 9. Downstream contracts

The packed-ready event contains only the minimum authorized reference data: packing session/package IDs, source pick-list ID/version, party/flow context, package count/approved measurements, completion status, exception summary, actor/time, and correlation ID. `19` uses it for dispatch scheduling/status; `08` uses it to gate final dispatch only if the approved contract requires packing; `10` uses approved package fields when rendering documents.

The event is idempotent and does not include client authority, raw secrets, unrestricted document bodies, or a new price. A downstream outage leaves packing history intact and produces retryable attention state.

## 10. Testing strategy

- **Vitest:** source eligibility, scan/quantity/UOM validation, package allocation invariants, status transitions, exception routing, idempotency, and event payload redaction.
- **Real Postgres:** packing schema/RLS, source/version concurrency, duplicate package assignment, accepted quantity constraints, lifecycle/history immutability, revoked access, and audit records.
- **Integration/jobs:** `08` source event, `19` handoff, `10` document-field consumption, labels/Storage, retries, and failure recovery.
- **Playwright:** floor scan flow, wrong-scan recovery, package assignment, seal/ready state, exception handling, offline/stale distinction, responsive office review, accessibility, and scanner focus.
- **Manual QA:** representative VMI/Trading/Supplies cases, partial/damage/shortage policy, printer/label readability, warehouse human factors, and confirmation that dispatch/inventory/pricing boundaries remain intact.
