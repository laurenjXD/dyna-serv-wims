# Notifications schema draft — for Track 3 to land at `lib/db/schema/notifications.ts`

Traceability: specs/14-notifications-and-alerts/design.md §3, requirements.md R1/R1-A/R2.

## New enums — add to `lib/db/schema/enums.ts`

```typescript
export const notificationCategoryEnum = pgEnum("notification_category", [
  "approval_attention",
  "receiving_exception",
  "transfer_attention",
  "pick_list_readiness",
  "trading_attention",
  "service_job_failure",
  "low_stock",
  "expiry_approaching",
  "lot_depleted",
  "receiving_discrepancy",
  "inspection_failure",
  "commitment_overdue",
  "document_generation_failure",
]);

export const notificationSeverityEnum = pgEnum("notification_severity", [
  "info",
  "warning",
  "critical",
]);

export const notificationLifecycleStatusEnum = pgEnum("notification_lifecycle_status", [
  "pending",
  "delivered",
  "failed",
  "read",
  "acknowledged",
  "expired",
  "dismissed",
]);

export const notificationDeliveryChannelEnum = pgEnum("notification_delivery_channel", [
  "in_app",
  "email",
]);

export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
  "dead_letter",
]);

export const alertConditionTypeEnum = pgEnum("alert_condition_type", [
  "threshold",
  "event",
  "schedule",
]);

export const alertRuleScopeEnum = pgEnum("alert_rule_scope", [
  "global",
  "party_scoped",
  "flow_scoped",
]);
```

## `notifications` (design.md §3 "notifications")

```typescript
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import {
  notificationCategoryEnum,
  notificationSeverityEnum,
  notificationLifecycleStatusEnum,
  flowTypeEnum,
} from "./enums";
import { parties } from "./parties";

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientUserId: uuid("recipient_user_id").notNull(),
  category: notificationCategoryEnum("category").notNull(),
  severity: notificationSeverityEnum("severity").notNull(),
  status: notificationLifecycleStatusEnum("status").default("pending").notNull(),
  // Safe display text only — never the protected payload itself
  // (design.md §5: "safe display text may be stored, sensitive source
  // payloads should be fetched on demand"). templateVersion lets a
  // future template edit not retroactively rewrite historical rows.
  titleSafe: text("title_safe").notNull(),
  bodySafe: text("body_safe").notNull(),
  templateVersion: text("template_version").notNull(),
  // Source event this notification was created from — for idempotency
  // and for "refetch authoritative source record" (requirements.md R1.5).
  sourceEventId: uuid("source_event_id").notNull(),
  sourceType: text("source_type").notNull(), // e.g. "wrr_documents", "approval_requests"
  sourceId: uuid("source_id").notNull(),
  // Nullable: not every notification is party-scoped (e.g. document_generation_failure is global-admin).
  partyId: uuid("party_id").references(() => parties.id),
  flowType: flowTypeEnum("flow_type"),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
}, (table) => ({
  // Idempotency per requirements.md R1.3: same source event + recipient +
  // template version never creates a second row. Channel is on the
  // notification_deliveries table (a notification can fan out to
  // multiple channels), so this key is deliberately narrower than
  // design.md §4's "(event_id, recipient_id, channel, template_version)"
  // — that composite key is enforced on notification_deliveries instead,
  // where channel actually varies per row.
  recipientEventUnique: uniqueIndex("notifications_recipient_event_unique")
    .on(table.recipientUserId, table.sourceEventId, table.templateVersion),
  recipientUnreadIdx: index("notifications_recipient_status_idx")
    .on(table.recipientUserId, table.status),
  categoryIdx: index("notifications_category_idx").on(table.category),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
}));
```

## `notification_deliveries` (design.md §3 "notification_deliveries")

```typescript
import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { notificationDeliveryChannelEnum, notificationDeliveryStatusEnum } from "./enums";
import { notifications } from "./notifications"; // same file, defined above

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  notificationId: uuid("notification_id").references(() => notifications.id).notNull(),
  channel: notificationDeliveryChannelEnum("channel").notNull(),
  status: notificationDeliveryStatusEnum("status").default("queued").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  providerMessageId: text("provider_message_id"),
  // Sanitized only — never raw provider payload (design.md §5: "Logs,
  // errors, provider metadata, and telemetry are redacted").
  lastErrorSafe: text("last_error_safe"),
  queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
}, (table) => ({
  // The real design.md §4 composite dedup key lives here, where channel
  // genuinely varies per row.
  eventChannelUnique: uniqueIndex("notification_deliveries_idempotency_unique")
    .on(table.notificationId, table.channel, table.idempotencyKey),
}));
```

## `notification_preferences` (design.md §3 "notification_preferences")

```typescript
import { pgTable, uuid, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { notificationCategoryEnum, notificationDeliveryChannelEnum } from "./enums";

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  category: notificationCategoryEnum("category").notNull(),
  channel: notificationDeliveryChannelEnum("channel").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userCategoryChannelUnique: uniqueIndex("notification_preferences_unique")
    .on(table.userId, table.category, table.channel),
}));
```

**Mandatory-channel enforcement (requirements.md R4.4, design.md §4):** application-layer, not a DB constraint — `critical` severity + certain categories (security, `document_generation_failure`) ignore a `false` preference row entirely. Document this in the query layer (Phase 2 Task 8), not the schema.

## `alert_rules` and `inventory_alert_events` — deferred to a Phase 0b request

Not included in this first request. `requirements.md` §6 leaves "initial alert metrics/events and owning feature for each threshold" and the exact rule-table shape only provisional pending the Product Owner's threshold decisions (reorder-level source, expiry windows, commitment-overdue window, cooldown periods — `requirements.md` §6 last bullet). The seven `R1-A` alert types themselves (low stock, expiry, lot depleted, receiving discrepancy, inspection failure, commitment overdue, document generation failure) are individually well-specified — deferring only the generic *rule administration* table, not the alerts themselves. Phase 2 implements those seven alerts as fixed application logic against the fixed thresholds already stated in `requirements.md` R1-A (24h low-stock cooldown, 30/7-day expiry windows); `alert_rules`/`inventory_alert_events` (for future admin-configurable thresholds) becomes a Phase 3 follow-up once the Product Owner has actually made those calls, per design.md's own "provisional until schema review" framing.
