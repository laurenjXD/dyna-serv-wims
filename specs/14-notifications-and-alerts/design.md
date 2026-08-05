# Notifications & Alerts — Design

Status: Draft
Updated: 2026-08-05

## 1. Design intent

`14` is a scoped notification projection and delivery coordinator. A workflow commits authoritative state, writes a durable event/outbox entry, and `14` turns that event into recipient-specific in-app and optional email deliveries. The notification is a pointer and attention mechanism; the source record is always reloaded and reauthorized before action.

## 2. Dependencies and ownership

Depends on `00-steering` for product, brand, technology, structure, and testing; `01` for canonical entities; `02` for capability/scope/RLS; `03` for the online/offline boundary; `04` for jobs, Realtime, email, correlation, retries, and telemetry; and `05` for shell integration.

Event producers are `07` receiving, `08` outgoing commitment, `09` approval queue, `10` pick list/acknowledgement receipt, `11` transfer/inspection, and `13` Trading orders/pricing. `12` VMI billing and future threshold/reporting features own their business calculations and publish only approved notification inputs. `14` does not become a second workflow state machine.

`16-reporting-and-analytics` is the source for aggregate `qty_available` metrics used in low-stock threshold evaluation. `14` consumes the approved derived view/event (`lot_inventory_totals`) that `16` (or `01`) exposes; it never queries `lot_location_balances` directly.

## 3. Logical model

The provisional model is:

```text
notifications
  id, recipient_user_id, category, severity, template_version,
  title/body_safe, source_type, source_id, flow_type,
  created_at, expires_at, read_at, acknowledged_at, dismissed_at

notification_deliveries
  id, notification_id, channel, status, attempt_count,
  idempotency_key, provider_message_id, last_error_safe,
  queued_at, delivered_at, failed_at

notification_preferences
  user_id, category, channel, enabled, updated_by, updated_at

alert_rules
  id, category, condition_type (threshold | event | schedule),
  metric_source_feature, threshold_value, advance_days,
  cooldown_hours, severity, scope (global | party_scoped | flow_scoped),
  enabled, created_by, updated_at

inventory_alert_events
  id, alert_rule_id, source_type, source_id,
  item_id, lot_id (nullable), current_value, threshold_value,
  triggered_at, resolved_at (nullable), resolution_type
```

These names and fields are provisional until the schema review. Protected source references must be rechecked through source-feature authorization. Safe display text may be stored, but sensitive source payloads should be fetched on demand rather than copied into a notification.

## 4. Event-to-delivery flow

```text
source transaction
  -> durable domain event/outbox (same DB transaction where possible)
  -> 14 router resolves current capability + party/flow scope
  -> notification row per authorized recipient
  -> in-app availability + optional email delivery job
  -> Realtime minimal signal / polling fallback
  -> client refetches notification and source record
```

The router uses a stable event type, schema version, source reference, original actor, system executor, and correlation ID. It computes recipients at processing time and applies preferences only after mandatory-channel rules. A unique key such as `(event_id, recipient_id, channel, template_version)` prevents duplicate effects. Retries are safe; permanently failed jobs enter the shared operator-visible dead-letter path.

## 5. Authorization and privacy

All notification reads and mutations run through the current authorization context. The recipient query is an intersection of:

```text
active capability
  + matching resource/action
  + matching party scope
  + matching optional flow_type scope
  + category/channel policy
```

Realtime uses RLS-backed, user-scoped channels and publishes only a minimal notification ID/type/status signal. The browser never receives a global notification stream. Email links are internal, non-guessable, and resolve through an authorized server route; a revoked user receives a safe not-found/forbidden result without source existence leakage.

Separate internal and party-safe templates prevent Trading cost/margin, VMI internal billing data, inspection evidence, or unrelated party information from leaking. Logs, errors, provider metadata, and telemetry are redacted.

## 6. Client and shell behavior

The shell owns the notification entry point, unread badge, accessible live-region summary, and a non-blocking attention queue. It consumes `03`’s connectivity/sync status as read-only and labels cached notification data as stale when offline. It does not show a successful sync state merely because Realtime connected.

Feature surfaces own immediate workflow feedback: a receiving scan result, an approval decision result, a FIFO/price error, an inspection disposition, or a committed pick action. A notification can link to that surface, but clicking it never executes the linked mutation automatically.

Desktop office views may provide filtering and bulk read/dismiss actions. Mobile/floor views use large touch targets, short text, clear severity labels/icons, and keyboard-scanner-safe focus behavior. Bulk read affects presentation state only and must be authorized/rate-limited.

## 7. Failure and consistency behavior

- Realtime absent/delayed: show durable records after polling/manual refresh/reconnect; correctness is unchanged.
- Email absent/delayed: retain in-app record, retry asynchronously, expose delivery state to authorized operators.
- Duplicate/out-of-order event: idempotency and source-version checks prevent duplicate visible notices.
- Source record later changed: notification history remains a historical notice; detail view displays current authorized state and its changed status.
- Source transaction rolled back: its transactional outbox event is absent; a job must not manufacture a success notification.
- Offline: read-only cached display is allowed if the user had access when cached; send/ack/rule/preference operations wait for an online request and reauthorize.

## 8. Testing strategy

- Vitest: routing matrix, scope intersection, category/policy rules, template redaction, deduplication, severity/escalation, state transitions, and retry classification.
- Real Postgres: migrations, RLS, recipient isolation, counts, unique idempotency constraints, revoked access, and append-only audit behavior.
- Provider/integration: outbox/job claim and retry, Resend adapter, sanitized provider failures, Realtime scoped signal, reconnect and polling fallback.
- Playwright: notification center, safe links, read/ack/dismiss, role/party isolation, delayed/duplicate events, email-independent in-app continuity, offline stale state, accessibility, and responsive shell behavior.
- Manual QA: approved email rendering/deliverability, critical alert wording, floor distraction review, and operational dead-letter runbook.

## 9. Inventory alert evaluation

- **Threshold alerts** (low stock, expiry approaching, pick-list commitment overdue) are evaluated by a scheduled job that reads from approved derived views (`lot_inventory_totals`, `lots`) — never raw `lot_location_balances` directly. The job compares the current metric value against the configured threshold and emits an internal alert event when the condition is met.
- **Event-driven alerts** (receiving discrepancy, inspection failure requiring disposition, document generation failure, lot fully depleted) are triggered by a domain event published by the owning feature (`07`, `08`, `11`, `04` respectively). `14` subscribes to these via the standard durable outbox/event intake path and does not poll source tables.
- Every alert — regardless of origin — goes through the same recipient-resolution and deduplication pipeline as other notifications. Capability intersection, party/flow scope, and mandatory-channel rules all apply.
- Supervisors are always in the default recipient set for inventory alerts within their party/flow scope. Administrators receive critical-severity alerts globally (document generation failure, inspection failure requiring disposition).
- **Cooldown and deduplication**: a low-stock alert for the same item suppresses duplicate firings for the configured cooldown period (default 24 h). Expiry alerts at 30 days and 7 days are treated as distinct severity tiers and each fires once per lot per tier unless the lot is restocked and falls back into the window. Commitment-overdue alerts follow the same per-commitment cooldown.
- **Alert resolution**: when the triggering condition clears (e.g. stock is restocked above the item's `reorder_level`, a failed inspection receives a disposition, a depleted lot is closed), the open `inventory_alert_events` record is marked `resolved` and a resolution notice is sent to the original recipients. The resolution notice is informational only — it never confirms an inventory transaction, approves a request, or alter source workflow state.
