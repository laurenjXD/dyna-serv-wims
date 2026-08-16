// `notifications` — specs/14-notifications-and-alerts/design.md §3 (logical
// model, "notifications" table), trimmed per the 2026-08-16 P1 MVP-slice
// scoping decision recorded in specs/00-steering/revision-log.md ("`14` —
// P1 MVP slice scoped: notifications table + navbar bell, not full spec").
//
// This is ONLY the `notifications` table itself. `notification_deliveries`,
// `notification_preferences`, `alert_rules`, and `inventory_alert_events`
// (design.md §3's other four tables) are explicitly deferred to later
// phases (email delivery / alert-rule engine) and are NOT scaffolded here.
// No event producers are wired yet either — see the revision-log entry for
// why an honest-empty-state table is still real, working infrastructure.
//
// Fields are trimmed from design.md §3's provisional list to what this
// slice's read/list/mark-read surface actually needs: no `severity`,
// `template_version`, `acknowledged_at`, `dismissed_at`, `source_event_id`,
// `correlation_id`, or `party_id` yet — those return with the router/
// dedup/preferences phases once there are real producers and idempotency
// requirements to enforce. `category` and `source_type` are plain `text`
// for now (not enums) because no producer exists yet to constrain the
// taxonomy against; §3's fuller enum-backed draft (see
// docs/superpowers/plans/2026-08-09-notifications-schema-draft.md, a
// different track's parallel-branch work, not landed on main) is the
// natural next step once real event categories are being emitted.
//
// `recipientUserId` is a plain `uuid` here, NOT a Drizzle `.references()`
// call — this codebase's established pattern (lib/db/schema/wrr.ts's
// `wrrItemUnitScans.scannedByUserId`, lib/db/schema/approvals.ts's
// `requesterUserId`) is that FKs to `auth.users` are declared in the SQL
// migration only, since Drizzle cannot import the `auth` schema directly.
//
// RLS (0026_notifications.sql): a user reads/updates (mark-read) only rows
// where `recipient_user_id = auth.uid()` — design.md §5's full capability +
// party + flow_type + category/channel intersection is deferred; this slice
// has no cross-recipient producers yet for that intersection to matter
// against, per the revision-log scoping decision.
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { flowTypeEnum } from "./enums";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // auth.users UID of the recipient. FK declared in the SQL migration.
    recipientUserId: uuid("recipient_user_id").notNull(),
    // Free-text category for this slice (no producers yet to constrain an
    // enum against). See module header.
    category: text("category").notNull(),
    // Safe display text only, per design.md §5 ("safe display text may be
    // stored, but sensitive source payloads should be fetched on demand").
    title: text("title").notNull(),
    body: text("body"),
    // Pointer back to the source record for "refetch and reauthorize"
    // (design.md §1). Nullable: this slice has no producers yet.
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    // Nullable: not every notification will be flow-scoped, and this slice
    // has no producers populating it yet.
    flowType: flowTypeEnum("flow_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    // Unread-lookup and list-query support (recipient + read state, and
    // recipient + newest-first).
    recipientReadIdx: index("notifications_recipient_read_idx").on(
      table.recipientUserId,
      table.readAt,
    ),
    recipientCreatedAtIdx: index("notifications_recipient_created_at_idx").on(
      table.recipientUserId,
      table.createdAt.desc(),
    ),
  }),
);
