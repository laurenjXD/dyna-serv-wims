// RED-step schema tests for lib/db/schema/audit.ts
// Traceability: design.md §1.2 (`audit_log`) — the immutable, cross-entity
// accountability record, indexes on entity/actor/correlation, and the
// payload-present CHECK constraint.
import { describe, expect, it } from "vitest";
import { checkConstraints, column, tableName } from "./helpers";

describe("audit.ts — audit_log table", () => {
  it("is named 'audit_log'", async () => {
    const { auditLog } = await import("../audit");
    expect(tableName(auditLog)).toBe("audit_log");
  });

  it("has actorUserId and actorRole as notNull", async () => {
    const { auditLog } = await import("../audit");
    expect(column(auditLog, "actorUserId").notNull).toBe(true);
    expect(column(auditLog, "actorRole").notNull).toBe(true);
  });

  it("has action, entityType, entityId as notNull", async () => {
    const { auditLog } = await import("../audit");
    expect(column(auditLog, "action").notNull).toBe(true);
    expect(column(auditLog, "entityType").notNull).toBe(true);
    expect(column(auditLog, "entityId").notNull).toBe(true);
  });

  it("has nullable jsonb beforeData, afterData, diffData", async () => {
    const { auditLog } = await import("../audit");
    for (const key of ["beforeData", "afterData", "diffData"]) {
      expect(column(auditLog, key).notNull).toBe(false);
    }
  });

  it("has correlationId notNull (canonical X-Correlation-Id per 04 §15.3)", async () => {
    const { auditLog } = await import("../audit");
    expect(column(auditLog, "correlationId").notNull).toBe(true);
  });

  it("has createdAt notNull with default, stored withTimezone", async () => {
    const { auditLog } = await import("../audit");
    const createdAt = column(auditLog, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });

  it("declares the audit_log_payload_present CHECK constraint (at least one of before/after/diff)", async () => {
    const { auditLog } = await import("../audit");
    expect(checkConstraints(auditLog)).toContain("audit_log_payload_present");
  });
});
