# Notifications & Alerts — Implementation Plan

Status: Draft

## Implementation gate

No notification tables, alert evaluators, email templates, Realtime subscriptions, or notification routes may be implemented until `requirements.md` and `design.md` are approved, the open taxonomy/retention decisions are recorded in `specs/00-steering/revision-log.md`, and both sign-offs below are complete. Writing migrations or application code is prohibited while this feature remains Draft.

## Dependencies and aligned boundaries

- `02` approves capabilities, party/flow scope, RLS, recipient resolution, and audit.
- `03` confirms notification reads may be cached but notification mutations are Tier 2 online-only.
- `04` supplies the outbox/job, Resend, Realtime, retry/dead-letter, correlation, and telemetry infrastructure.
- `05` supplies the shell entry point, badge, accessible attention treatment, and offline/sync status contract.
- `07`, `08`, `09`, `10`, `11`, and `13` define source events and remain authoritative for receiving, withdrawal, approvals, documents, transfers, and Trading.
- `12` and any inventory/reporting feature must approve the metric/event contract before an alert rule is added.

## 1. Resolve product and policy decisions

Testing: product/design/operations review; revision-log update.

- [ ] Approve notification categories, severity taxonomy, mandatory channels, and floor-versus-office presentation policy.
- [ ] Decide read, acknowledge, dismiss, expiry, escalation, cooldown, and bulk-action semantics.
- [ ] Define email templates, sender identity, recipient preference rules, rate limits, and safe-link wording.
- [ ] Define retention/redaction for notification bodies, delivery attempts, provider IDs, and operational diagnostics.
- [ ] List initial source events, recipients, required capabilities, source links, and owning feature for each event.
- [ ] List initial alert metrics/thresholds and confirm that `14` routes rather than recalculates business truth.
- [ ] Record decisions in `specs/00-steering/revision-log.md`.

## 2. Define schema and event contracts

Testing: schema review; `db-migration-verifier`; real-Postgres plan.

- [ ] Define approved `notifications`, `notification_deliveries`, and `notification_preferences` tables or equivalents.
- [ ] Define optional alert-rule/event tables only after metric ownership is approved.
- [ ] Add source event type/version, recipient, resource reference, flow/party context, safe template data, lifecycle timestamps, actor, executor, and correlation fields.
- [ ] Add unique idempotency constraints for event/recipient/channel/template and indexes for recipient/unread/category/time queries.
- [ ] Define immutable/history-safe behavior and retention jobs; do not overwrite source workflow history.
- [ ] Define event contracts for approval, receiving/inspection, transfer, pick/document, Trading, and approved service/threshold alerts.

## 3. Implement authorization and safe projections

Testing: unit routing tests; real-Postgres RLS integration; `rbac-rls-reviewer` review.

- [ ] Add notification read/read-state/preferences/operations capabilities to the canonical RBAC catalog.
- [ ] Implement recipient resolution from current capability plus party and optional `flow_type` scope.
- [ ] Implement default-deny RLS for notification rows, deliveries, preferences, and alert administration.
- [ ] Create internal and party-safe projections/templates; exclude cost, margin, evidence, unrelated parties, and protected payloads.
- [ ] Implement safe source-link authorization and revoke/recheck behavior.
- [ ] Add audit events for routing, suppression, delivery, read/ack/dismiss, preference/rule changes, retry, and dead-letter handling.

## 4. Implement durable event routing and delivery

Testing: unit idempotency/retry tests; job/provider integration; real-Postgres outbox and concurrency tests.

- [ ] Consume the shared `04` outbox/job contract with atomic claim/lease, retry/backoff, correlation, and dead-letter handling.
- [ ] Resolve recipients server-side and create one durable in-app record per approved recipient/event.
- [ ] Apply mandatory-channel and user-preference policy without allowing preferences to bypass authorization.
- [ ] Add Resend transactional email adapter integration using delivery idempotency keys and sanitized provider status.
- [ ] Ensure source transactions remain successful when notification/email delivery fails.
- [ ] Verify duplicate, delayed, out-of-order, revoked-scope, and missing-recipient behavior.

## 5. Implement Realtime, polling, and client state

Testing: scoped Realtime integration; Playwright outage/reconnect/offline tests.

- [ ] Publish only minimal user-scoped notification signals under RLS-backed authorization.
- [ ] Build notification list/detail queries that refetch authoritative notification/source data after a signal.
- [ ] Add reconnect, tab-visibility, periodic polling, and manual refresh fallback.
- [ ] Integrate `05` shell badge/center with `03`’s `online/offline/checking` and `idle/syncing/attention` states.
- [ ] Ensure offline cached reads are visibly stale and no send/ack/preference/rule mutation is queued.

## 6. Build user and operator surfaces

Testing: Playwright; accessibility and responsive manual QA.

- [ ] Build notification center with unread count, filters, severity/icon/text cues, timestamps, safe links, and empty/error/stale states.
- [ ] Add read/acknowledge/dismiss behavior only where approved; make clear these actions do not execute workflow commands.
- [ ] Build preferences for approved categories/channels and protect mandatory notifications.
- [ ] Build authorized delivery/dead-letter diagnostics without exposing protected message content.
- [ ] Add alert-rule administration only for approved roles and metric contracts.
- [ ] Preserve floor-priority focus and scanner-safe behavior; workflow-specific feedback stays in its owning feature.

## 7. End-to-end verification and release readiness

- [ ] Verify approval, receiving, transfer, pick/document, and Trading producers create correctly scoped notices.
- [ ] Verify notification receipt never changes authoritative approval, inventory, inspection, document, order, or price state.
- [ ] Verify no cross-party discovery through counts, filters, realtime, URLs, email, errors, logs, or exports.
- [ ] Verify critical in-app continuity when Resend fails and workflow continuity when Realtime/jobs are unavailable.
- [ ] Verify accessibility, keyboard navigation, reduced motion, contrast, mobile layout, and floor distraction behavior.
- [ ] Verify notification delivery backlog/dead-letter alerts, retention, redaction, correlation IDs, and runbook procedures.
- [ ] Run all applicable Vitest, real-Postgres, provider/integration, and Playwright tests before sign-off.

## Sign-off

- [ ] Taxonomy, mandatory notifications, alert ownership, retention, and email policy are resolved.
- [ ] Schema, event contracts, recipient scope, RLS, and safe projections are approved.
- [ ] `02`, `03`, `04`, and `05` integration contracts are verified.
- [ ] Source features approve their event payloads and links.
- [ ] Tests and manual QA pass, including failure and offline scenarios.
- [ ] Product/operations approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
