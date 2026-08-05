# Dispatch Scheduling & Delivery Tracking — Design

Status: Draft

## 1. Design intent

`19` is a scheduling and delivery-status projection around an outbound source. It accepts an approved packed-ready handoff from `18`, coordinates schedule/assignment and any required approval, supplies context to `08` for final dispatch, then records the authoritative dispatch and delivery lifecycle.

It does not become the inventory or document source of truth. `08` owns physical dispatch and the `pick` ledger transaction; `10` owns priced documents; `18` owns packing; `14` owns notification delivery.

## 2. Foundational dependencies and ownership

Depends on `00-steering` for product, technology, structure, testing, and design; `01` for canonical parties/items/lots/locations/pick lists and immutable transactions; `02` for capabilities, party/flow scope, RLS, and audit; `03` for online/offline status; `04` for Auth, jobs, Realtime, integrations, Storage, retries, and telemetry; `05` for routes/shell; `08` for final dispatch; `09` for dispatch approval decisions; `10` for documents; `14` for notifications; `16` for reporting; and `18` for packing readiness.

### Source and feature-owned data

| Data | Role in `19` | Owner |
|---|---|---|
| `18` packing session/package handoff | Eligibility and package/source snapshot. | `18`; current authorized read. |
| `08` pick/dispatch source | Final physical dispatch state and immutable inventory outcome. | `08`/core. |
| `09` approval decision | Exact dispatch approval where required. | `09`. |
| `10` documents | Priced pick-list/acknowledgement-receipt snapshot and artifact references. | `10`. |
| Dispatch/schedule/tracking records | Schedule, assignment, state transitions, milestones, exceptions, integration refs. | `19`; final persistence shape to be approved. |
| `14` notifications | Delivery/routing projection. | `14`; `19` only emits approved events. |

## 3. Provisional logical model

The final tables, fields, and ownership must be reconciled before approval. The logical model is:

```text
dispatch_plans
  id, source_pick_list_id, packing_session_id,
  source_version/event_id, party/destination context,
  flow_type, readiness/status, schedule window,
  carrier/service/vehicle/driver refs,
  approval ref/version, actor/time, correlation/idempotency

dispatch_packages (only if not owned by 18)
  dispatch_plan_id, package ref, sequence, label/tracking ref,
  approved dimensions/weight/status

delivery_events
  dispatch_plan_id, event type, prior/new status,
  event_time, received_at, actor/executor, source/ref,
  reason, safe location/facility metadata, correlation

delivery_exceptions / integration_attempts
  type, status, retry/attempt metadata, resolution,
  safe provider/reference/error data
```

`19` must not duplicate package truth already owned by `18`, approval truth owned by `09`, or inventory/documents owned by `08`/`10`. If a separate delivery aggregate is needed, it must link to opaque source IDs and preserve versioned history.

## 4. Lifecycle and state machine

The intended lifecycle is:

```text
packed_ready
  -> pending_approval (if required)
  -> schedulable
  -> scheduled
  -> dispatch_pending
  -> dispatched              [08 authoritative event]
  -> in_transit
  -> delivery_attempted
     ├-> delivered
     ├-> delayed
     ├-> failed
     └-> returned
```

Cancellation, rescheduling, and exception states are explicit side paths. Exact names and legal transitions require policy approval. `scheduled` or `packed_ready` never implies that inventory has been decremented. `dispatched` in `19` is accepted only from the authoritative `08` result; a planned carrier pickup or local scan cannot mint it.

Every transition includes the expected current version/state, actor/executor, event time, received time, reason/reference, and idempotency key. The server rejects illegal, stale, duplicate, or out-of-order mutations or records them as non-authoritative observations pending review.

## 5. Scheduling and approval flow

```text
18 packed-ready event + current 08 source
  -> 19 readiness validation
  -> optional 09 exact approval
  -> schedule/assign carrier and delivery window
  -> provide schedule context to 08
  -> 08 final dispatch command and immutable pick transaction
  -> 19 accepts dispatch event
  -> carrier/delivery milestones
```

Schedule commands are server-owned and transactionally protected by source/version and idempotency. Rescheduling does not edit the original history; it adds a versioned schedule event and preserves who changed what and why.

If dispatch approval is required, `19` sends the exact versioned target to `09`, then rechecks the decision at the command boundary. Notification receipt, role name, or a browser flag is never approval.

## 6. Delivery events and integrations

Delivery updates may arrive from an authorized internal operator, restricted carrier surface, or approved integration. Every source uses a normalized event contract with provider/source ID, event type, event time, received time, current source version, safe metadata, and correlation ID.

Provider adapters are isolated behind `04`, use server-side credentials, rate limits, timeouts, retries, and redacted telemetry. Duplicate provider events are idempotent. Provider outages do not alter `08` inventory state or `10` document content. If proof-of-delivery is later approved, private Storage access and retention must be defined before implementation.

## 7. Authorization, privacy, and offline behavior

The effective scope is:

```text
current capability
  + source pick/packing access
  + party scope
  + optional flow_type scope
  + dispatch/delivery field policy
  + RLS
```

Party users see only their own approved shipment/delivery projections. Internal users still need the relevant capability; administrator status is not a service-role bypass. Totals, schedules, tracking references, status endpoints, notifications, and provider errors use safe denial and do not disclose unrelated shipments.

Schedule changes, approval requests, status mutations, and exception resolution are online-only. A limited delivery observation may be captured offline only if `03` approves it; replay reauthenticates, reauthorizes, checks source/version and transition order, and applies idempotency. Cached statuses display their as-of time and stale state.

## 8. Client surfaces and integrations

The office dispatch board supports readiness, schedule windows, assignment, approval state, exception queue, and delivery status with accessible tables/cards and responsive behavior. A field/handoff surface uses large touch targets, clear status text/icons, scanner-first reference lookup, and one primary action. It never presents a delivery status as inventory completion.

`14` receives minimal approved event inputs for schedule, dispatch, delay, attempt, failure, return, and delivery completion notifications. `16` receives versioned operational measures with source/as-of metadata. `10` links are reauthorized and preserve immutable document snapshots.

## 9. Testing strategy

- **Vitest:** readiness rules, state-transition matrix, schedule conflict detection, approval matching, idempotency, event ordering, scope mapping, redaction, and notification/report payloads.
- **Real Postgres:** dispatch/delivery schema, RLS, source/version concurrency, unique idempotency, append-only event history, revoked access, and retention.
- **Integration/jobs:** `18`/`08` events, `09` approvals, carrier adapters, retries/dead letters, Realtime invalidation, `14` event routing, and `16` metric projection.
- **Playwright:** dispatch board, schedule/reschedule/cancel, approval states, delivery milestones, party isolation, stale/offline behavior, responsive/mobile flow, accessibility, and safe document links.
- **Manual QA:** operational dispatch scenarios, delayed/failed/returned deliveries, timezone/display checks, provider failure, privacy review, and confirmation that dispatch updates never mutate inventory or pricing.
