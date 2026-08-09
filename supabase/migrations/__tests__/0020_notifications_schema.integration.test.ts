// Real-Postgres integration test for the not-yet-written
// supabase/migrations/0020_notifications_schema.sql.
//
// Traceability:
//   - specs/14-notifications-and-alerts/tasks.md §2 ("Define schema and
//     event contracts") — the checklist item this test batch backs.
//   - specs/14-notifications-and-alerts/requirements.md R1 ("Durable
//     notification records"), R1-A ("Inventory and operational threshold
//     alerts"), R2.4 ("Duplicate ... events SHALL not create duplicate
//     user-visible effects"), R5.2/R5.4 (alert-rule fields, dedup/cooldown),
//     R6.4 (actor/system-executor/correlation auditability).
//   - specs/14-notifications-and-alerts/design.md §3 (Logical model),
//     §4 ("A unique key such as (event_id, recipient_id, channel,
//     template_version) prevents duplicate effects"), §9 (inventory alert
//     evaluation, threshold vs. event alerts, cooldown).
//   - specs/00-steering/testing.md's two-stage DB-testing requirement
//     ("Before tasks.md sign-off — real-Postgres integration tests ... run
//     the real migrations in order ... assert on real results").
//
// THIS TEST REQUIRES A LIVE POSTGRES CONNECTION, following the precedent
// already established in lib/db/__tests__/rls-transaction.integration.test.ts:
// point TEST_DATABASE_URL or DATABASE_URL at a disposable Postgres instance
// and run `npm run test:integration`. Without either env var set, every test
// in this file is skipped (not failed) — this file is not part of the
// default `npm test` / CI unit-tier run (see vitest.config.mts's exclude of
// `**/*.integration.test.ts` and vitest.integration.config.mts's own
// `**/*.integration.test.ts` include).
//
// This is a RED-step test: it targets supabase/migrations/0020_notifications
// _schema.sql, which does not exist yet on this branch (latest applied
// migration is 0019_document_rls.sql). The very first assertion below reads
// that file directly and is expected to fail with an ENOENT
// ("no such file or directory") error naming the missing migration file —
// the schema-equivalent of "Cannot find module" for a migration that hasn't
// been written, not a typo/fixture bug in this test itself. Everything after
// that first assertion documents the structural contract the eventual
// migration must satisfy, for `database-builder` to build against and
// `db-migration-verifier` to re-run once Docker/live Postgres is available
// in whichever environment picks this up next.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import {
  bootstrapPrerequisites,
  readMigrationFile,
  runAllExistingMigrations,
} from "./_run-migrations";

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const hasLiveDb = connectionString.length > 0;
const NOTIFICATIONS_MIGRATION = "0020_notifications_schema.sql";

describe.skipIf(!hasLiveDb)(
  "0020_notifications_schema.sql — real-Postgres schema/constraint contract (tasks.md §2)",
  () => {
    let sql: Sql;
    let migrationLoadError: unknown = null;

    beforeAll(async () => {
      sql = postgres(connectionString, { prepare: false });
      await bootstrapPrerequisites(sql);
      // Run every migration that DOES exist (0001..0019) so the schema is in
      // the real pre-14 state this feature's migration must build on.
      await runAllExistingMigrations(sql);

      // The migration this whole file is testing for. Expected to throw
      // ENOENT right now, since database-builder has not written it yet.
      try {
        const notificationsSql = readMigrationFile(NOTIFICATIONS_MIGRATION);
        await sql.unsafe(notificationsSql);
      } catch (err) {
        migrationLoadError = err;
      }
    });

    afterAll(async () => {
      await sql?.end({ timeout: 5 });
    });

    it("RED: 0020_notifications_schema.sql does not exist yet (ENOENT), so it cannot have been applied", () => {
      expect(migrationLoadError).not.toBeNull();
      const message = String(
        (migrationLoadError as { message?: string; code?: string })?.message ?? migrationLoadError,
      );
      const code = (migrationLoadError as { code?: string })?.code;
      // Node's fs ENOENT code, or the "no such file" text it produces --
      // proves this fails because the file is missing, not because of a
      // typo/connection problem elsewhere in this test.
      expect(code === "ENOENT" || /no such file|ENOENT/i.test(message)).toBe(true);
      expect(message).toContain(NOTIFICATIONS_MIGRATION);
    });

    // ---------------------------------------------------------------------
    // Everything below documents the structural contract the eventual
    // migration must satisfy (design.md §3, tasks.md §2's bullet list).
    // These will currently also fail/skip-equivalent because the tables
    // were never created (migrationLoadError above short-circuits real
    // schema creation) -- guarded with `it.skipIf` isn't used here on
    // purpose: a genuinely missing table should show up as a clear,
    // itemized failure per table/column, not silently skip, so
    // database-builder gets a full checklist of what GREEN must satisfy.
    // ---------------------------------------------------------------------

    describe("notifications table (design.md §3; R1.1, R1.4, R1.5, R6.4)", () => {
      it("exists as a base table in the public schema", async () => {
        const rows = await sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'notifications'
        `;
        expect(rows.length).toBe(1);
      });

      it("has the recipient, source-event, resource-reference, and lifecycle-timestamp columns tasks.md §2 requires", async () => {
        const expectedColumns = [
          "id",
          "recipient_user_id", // recipient
          "event_id", // source event id (idempotency key component)
          "event_type", // source event type
          "event_version", // source event schema version
          "source_type", // resource reference
          "source_id", // resource reference
          "category",
          "severity",
          "flow_type", // flow context
          "party_id", // party context
          "template_version",
          "title", // safe template data
          "body_safe", // safe template data
          "actor_user_id", // original actor (R3 "System job ... actor preserved")
          "system_executor", // system executor (R6.4)
          "correlation_id", // correlation (R6.4)
          "created_at", // lifecycle timestamp
          "expires_at", // lifecycle timestamp
          "read_at", // lifecycle timestamp
          "acknowledged_at", // lifecycle timestamp
          "dismissed_at", // lifecycle timestamp
        ];

        const rows = await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'notifications'
        `;
        const actual = rows.map((r) => r.column_name);
        for (const col of expectedColumns) {
          expect(actual, `notifications is missing column '${col}'`).toContain(col);
        }
      });

      it("enforces idempotent creation per (event_id, recipient_user_id) — R1.3 'created idempotently for the same source event, recipient'", async () => {
        const rows = await sql`
          SELECT tc.constraint_name,
                 array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS cols
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = 'notifications'
            AND tc.constraint_type = 'UNIQUE'
          GROUP BY tc.constraint_name
        `;
        const hasIdempotencyKey = rows.some(
          (r) =>
            (r.cols as string[]).includes("event_id") &&
            (r.cols as string[]).includes("recipient_user_id"),
        );
        expect(hasIdempotencyKey).toBe(true);
      });

      it("has indexes supporting recipient/unread/category/time queries (tasks.md §2)", async () => {
        const rows = await sql<{ indexdef: string }[]>`
          SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'notifications'
        `;
        const defs = rows.map((r) => r.indexdef.toLowerCase());
        expect(defs.some((d) => d.includes("recipient_user_id"))).toBe(true);
        expect(defs.some((d) => d.includes("category"))).toBe(true);
        expect(defs.some((d) => d.includes("created_at"))).toBe(true);
        // "unread" query support: either a dedicated partial index on
        // read_at, or read_at appearing in a composite recipient index.
        expect(defs.some((d) => d.includes("read_at"))).toBe(true);
      });

      it("recipient_user_id is NOT NULL and event_id/created_at are NOT NULL (durable, non-optional fields — R1.1)", async () => {
        const rows = await sql<{ column_name: string; is_nullable: string }[]>`
          SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'notifications'
            AND column_name IN ('recipient_user_id', 'event_id', 'created_at')
        `;
        for (const col of ["recipient_user_id", "event_id", "created_at"]) {
          const row = rows.find((r) => r.column_name === col);
          expect(row, `column '${col}' not found`).toBeDefined();
          expect(row?.is_nullable, `'${col}' must be NOT NULL`).toBe("NO");
        }
      });
    });

    describe("notification_deliveries table (design.md §3; R1.3, R2.4, R4.2)", () => {
      it("exists and references notifications(id)", async () => {
        const tableRows = await sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'notification_deliveries'
        `;
        expect(tableRows.length).toBe(1);

        const fkRows = await sql`
          SELECT ccu.table_name AS referenced_table
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_schema = 'public'
            AND tc.table_name = 'notification_deliveries'
            AND tc.constraint_type = 'FOREIGN KEY'
            AND kcu.column_name = 'notification_id'
        `;
        expect(fkRows.some((r) => r.referenced_table === "notifications")).toBe(true);
      });

      it("has channel, status, attempt_count, idempotency_key, provider_message_id, last_error_safe, and lifecycle timestamp columns", async () => {
        const expectedColumns = [
          "id",
          "notification_id",
          "channel",
          "status",
          "attempt_count",
          "idempotency_key",
          "provider_message_id",
          "last_error_safe",
          "queued_at",
          "delivered_at",
          "failed_at",
        ];
        const rows = await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'notification_deliveries'
        `;
        const actual = rows.map((r) => r.column_name);
        for (const col of expectedColumns) {
          expect(actual, `notification_deliveries is missing column '${col}'`).toContain(col);
        }
      });

      it("enforces per-delivery-channel idempotency — a UNIQUE constraint on (notification_id, channel, template_version), completing design.md §4's (event_id, recipient_id, channel, template_version) key via the notifications FK", async () => {
        const rows = await sql`
          SELECT tc.constraint_name,
                 array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS cols
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = 'notification_deliveries'
            AND tc.constraint_type = 'UNIQUE'
          GROUP BY tc.constraint_name
        `;
        const hasCompositeUnique = rows.some((r) => {
          const cols = r.cols as string[];
          return (
            cols.includes("notification_id") &&
            cols.includes("channel") &&
            cols.includes("template_version")
          );
        });
        expect(hasCompositeUnique).toBe(true);
      });
    });

    describe("notification_preferences table (design.md §3; R4.4)", () => {
      it("exists with user_id, category, channel, enabled, updated_by, updated_at, and a per-user/category/channel UNIQUE constraint", async () => {
        const tableRows = await sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'notification_preferences'
        `;
        expect(tableRows.length).toBe(1);

        const columnRows = await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'notification_preferences'
        `;
        const actual = columnRows.map((r) => r.column_name);
        for (const col of ["user_id", "category", "channel", "enabled", "updated_by", "updated_at"]) {
          expect(actual, `notification_preferences is missing column '${col}'`).toContain(col);
        }

        const uniqueRows = await sql`
          SELECT tc.constraint_name,
                 array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS cols
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = 'notification_preferences'
            AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
          GROUP BY tc.constraint_name
        `;
        const hasPerUserCategoryChannelKey = uniqueRows.some((r) => {
          const cols = r.cols as string[];
          return cols.includes("user_id") && cols.includes("category") && cols.includes("channel");
        });
        expect(hasPerUserCategoryChannelKey).toBe(true);
      });
    });

    describe("alert_rules table (design.md §3, §9; R5.2 — needed for threshold/event alert evaluation)", () => {
      it("exists with category, condition_type, metric_source_feature, threshold_value, advance_days, cooldown_hours, severity, scope, enabled, created_by", async () => {
        const tableRows = await sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'alert_rules'
        `;
        expect(tableRows.length).toBe(1);

        const columnRows = await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'alert_rules'
        `;
        const actual = columnRows.map((r) => r.column_name);
        for (const col of [
          "id",
          "category",
          "condition_type",
          "metric_source_feature",
          "threshold_value",
          "advance_days",
          "cooldown_hours",
          "severity",
          "scope",
          "enabled",
          "created_by",
          "updated_at",
        ]) {
          expect(actual, `alert_rules is missing column '${col}'`).toContain(col);
        }
      });

      it("restricts condition_type to threshold|event|schedule and scope to global|party_scoped|flow_scoped via CHECK constraints (design.md §3)", async () => {
        const checkRows = await sql<{ check_clause: string }[]>`
          SELECT cc.check_clause
          FROM information_schema.check_constraints cc
          JOIN information_schema.constraint_column_usage ccu
            ON cc.constraint_name = ccu.constraint_name
           AND cc.constraint_schema = ccu.constraint_schema
          WHERE ccu.table_schema = 'public' AND ccu.table_name = 'alert_rules'
        `;
        const clauses = checkRows.map((r) => r.check_clause.toLowerCase());
        expect(clauses.some((c) => c.includes("condition_type"))).toBe(true);
        expect(clauses.some((c) => c.includes("scope"))).toBe(true);
      });
    });

    describe("inventory_alert_events table (design.md §3, §9; R1-A, R5.4 cooldown/dedup)", () => {
      it("exists with alert_rule_id, source_type, source_id, item_id, lot_id, current_value, threshold_value, triggered_at, resolved_at, resolution_type", async () => {
        const tableRows = await sql`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'inventory_alert_events'
        `;
        expect(tableRows.length).toBe(1);

        const columnRows = await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'inventory_alert_events'
        `;
        const actual = columnRows.map((r) => r.column_name);
        for (const col of [
          "id",
          "alert_rule_id",
          "source_type",
          "source_id",
          "item_id",
          "lot_id",
          "current_value",
          "threshold_value",
          "triggered_at",
          "resolved_at",
          "resolution_type",
        ]) {
          expect(actual, `inventory_alert_events is missing column '${col}'`).toContain(col);
        }

        const fkRows = await sql`
          SELECT kcu.column_name, ccu.table_name AS referenced_table
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_schema = 'public'
            AND tc.table_name = 'inventory_alert_events'
            AND tc.constraint_type = 'FOREIGN KEY'
        `;
        expect(
          fkRows.some((r) => r.column_name === "alert_rule_id" && r.referenced_table === "alert_rules"),
        ).toBe(true);
        expect(fkRows.some((r) => r.column_name === "item_id" && r.referenced_table === "items")).toBe(
          true,
        );
      });
    });

    describe("immutable/history-safe behavior (tasks.md §2: 'do not overwrite source workflow history')", () => {
      it("notifications carries no source-of-truth business-state columns that could be mistaken for authoritative inventory/approval state (only pointer/reference fields)", async () => {
        // Guards against a future migration accidentally widening notifications
        // into a second state machine, per design.md §1 ("14 does not become
        // a second workflow state machine") -- checked by absence, not
        // presence, so it stays meaningful even as the table's own fields
        // evolve.
        const forbiddenColumns = ["qty_on_hand", "approved_by", "committed_qty", "unit_price"];
        const rows = await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'notifications'
        `;
        const actual = rows.map((r) => r.column_name);
        for (const col of forbiddenColumns) {
          expect(actual, `notifications should not store authoritative field '${col}'`).not.toContain(
            col,
          );
        }
      });
    });
  },
);
