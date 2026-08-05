# Notifications & Alerts — Requirements

Status: Draft

## 1. Purpose and scope

This feature provides durable in-app notifications and operational alerts for authorized users. It receives approved domain events from workflow features, determines scoped recipients, records delivery/read state, and sends transactional email where configured.

The source feature remains authoritative for business state. A notification SHALL never approve a request, reserve or move inventory, change a price, create a document, or prove that a workflow completed.

The feature covers notification records, alert severity and lifecycle, recipient/channel preferences, in-app presentation, email delivery coordination, deduplication, acknowledgement/read state, and operational failure visibility. Marketing campaigns, chat, SMS/push, and a general analytics alerting platform are out of scope for v1.

## 2. Aligned principles and boundaries

- PostgreSQL/domain records are authoritative; Realtime is an update signal and email is a delivery attempt.
- Recipients are calculated server-side from current RBAC capabilities plus explicit party and optional `flow_type` scope.
- A browser SHALL never subscribe to a global event stream and filter unauthorized notifications locally.
- Notification text, links, counts, and metadata SHALL not reveal a record the recipient cannot currently open.
- Notification reads may be cached for display, but notification sends, acknowledgements, preference changes, and alert-rule changes are online-only Tier 2 operations.
- `04-services-and-infrastructure` owns the durable outbox/job, Resend adapter, retry/dead-letter, correlation, and provider telemetry contracts.
- `05-ui-shell-and-navigation` owns the global shell entry point and broad connectivity/sync feedback; workflow features own scan results, blocking errors, approval decisions, receiving results, and other immediate operational feedback.
- One warehouse is assumed. No `warehouse_id` is introduced.

## 3. Actors and notification classes

- **Floor operator** — receives actionable receiving, transfer, pick, and exception notices within granted scope.
- **Approver/reviewer** — receives pending-approval notices only for requests they are currently authorized to review.
- **Trading/VMI/party user** — receives only notices for their permitted party and flow; internal cost, margin, or unrelated party data is excluded.
- **Administrator/operations user** — manages approved preferences/rules and reviews delivery failures according to capability.
- **System job** — creates notifications from durable domain events with the original actor preserved and the system executor audited.

Notification categories SHALL be explicit and extensible, including approval attention, receiving/inspection exception, transfer attention, pick-list/document readiness, Trading order/pricing attention, service/job failure, and approved inventory/operational threshold alerts. The owning feature must define the event and recipient capability before adding a category.

## 4. Functional requirements

### R1. Durable notification records

1. Each in-app notification SHALL have a stable ID, category/type, severity, title/body or template version, recipient, source event/correlation ID, optional protected resource reference, created time, and lifecycle status.
2. Delivery and presentation state SHALL distinguish pending, delivered/available, failed, read, acknowledged, expired, and dismissed where applicable; “read” SHALL not mean “approved” or “completed.”
3. Records SHALL be created idempotently for the same source event, recipient, channel, and template version.
4. Expiry and retention SHALL be explicit; historical records SHALL not be silently rewritten when source business state changes.
5. The record SHALL contain only the minimum display data needed. The detail page SHALL refetch the authoritative source record and reauthorize access.

### R2. Event intake and routing

1. Producers SHALL emit notifications only from committed, approved domain events or durable outbox records, not from optimistic client state.
2. Routing SHALL support recipient capability, party scope, optional flow scope, severity, category, and channel eligibility.
3. A missing, revoked, or ambiguous recipient scope SHALL suppress delivery and create an authorized operational diagnostic without exposing protected content.
4. Duplicate, delayed, out-of-order, and retried events SHALL not create duplicate user-visible effects.
5. Notification failure SHALL not roll back a committed inventory, approval, inspection, document, order, or pricing transaction; it SHALL be retryable and observable.

### R3. In-app center and shell integration

1. Authorized users SHALL have an in-app notification center with unread count, category/severity filters, timestamps, read state, and safe navigation links.
2. The center SHALL show stale/loading/offline state separately from notification severity and SHALL not claim that a workflow is synchronized merely because a notification arrived.
3. Realtime updates MAY refresh the count/list, but the client SHALL refetch authoritative records after reconnect, visibility change, manual refresh, or a missed event.
4. The shell SHALL avoid interrupting active floor scan flows with generic notices. Workflow-specific blocking or scan feedback remains feature-owned.
5. Color SHALL not be the only severity/status cue; icons, text, focus treatment, and accessible announcements SHALL be provided.

### R4. Email and delivery channels

1. Application email SHALL use the approved `04` Resend-backed transactional adapter; Supabase Auth email remains on its separate Auth path.
2. Email delivery SHALL be asynchronous, idempotent, rate-limited as appropriate, and recorded with sanitized provider status/error information.
3. Email templates SHALL use approved recipient-safe content and links that reauthorize access when opened; they SHALL not include internal cost, margin, credentials, or unrestricted document data.
4. Users MAY manage approved category/channel preferences, but mandatory security and critical operational notifications SHALL remain enabled.
5. Email failure, provider delay, or Realtime outage SHALL leave the in-app durable record available and SHALL surface to authorized operators without changing source workflow state.

### R5. Alert evaluation and acknowledgement

1. Alerts SHALL be generated from an approved event or metric contract owned by the relevant feature; `14` SHALL not duplicate inventory, approval, pricing, or billing calculations.
2. Rules SHALL define category, threshold/event condition, scope, severity, recipients, channels, cooldown/deduplication window, and escalation/expiry behavior.
3. Alert acknowledgement SHALL be an explicit presentation/operational action and SHALL not substitute for `09` approval, `08` commitment, inspection disposition, or any other source workflow command.
4. Repeated alert conditions SHALL follow the approved deduplication/escalation policy rather than flooding recipients.
5. Rule and preference changes SHALL be audited and take effect only through authorized online operations.

### R6. Security, privacy, and audit

1. Notification list, detail, counts, Realtime channels, email recipients, and links SHALL enforce the same RBAC/RLS resource and party/flow scope as the source record.
2. Revoked access SHALL prevent future delivery and prevent opening previously delivered protected links; already delivered text SHALL be limited by the approved retention/redaction policy.
3. Client-supplied recipient, category, severity, source ID, or target URL SHALL never establish authority.
4. Creation, routing decision, delivery attempt, read/acknowledge/dismiss, preference/rule change, suppression, retry, and failure SHALL be auditable with actor or system executor, timestamp, reason/status, and correlation ID.

## 5. Acceptance criteria

- A committed approval, receiving exception, transfer attention, pick-list readiness, or Trading event produces at most one scoped in-app notification per recipient under retries.
- An unauthorized or revoked user cannot discover the source record through notification text, counts, realtime, links, filters, or email.
- Realtime, email, or job failure does not alter authoritative workflow state, and retry/dead-letter status is visible to authorized operators.
- Offline mode does not queue notification mutations or present stale notification state as current.
- Critical notifications remain available in-app when email delivery fails.
- Accessibility and floor-priority shell rules are met without color-only status.

## 6. Decisions required before approval

- Final category/severity taxonomy and mandatory versus configurable notifications.
- Exact notification, delivery, preference, rule, and audit retention periods.
- Whether acknowledgement is needed for any category beyond read/dismiss.
- Initial email templates, sender identities, rate limits, escalation windows, and Asia/Manila display policy with UTC storage.
- Initial alert metrics/events and owning feature for each threshold.
