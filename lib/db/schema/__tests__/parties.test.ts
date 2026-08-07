// RED-step schema tests for lib/db/schema/parties.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria 2, 3
// ("parties"/"party_roles" table names; party role set) and design.md §1.2
// (`parties` & `party_roles`).
import { describe, expect, it } from "vitest";
import { column, hasColumn, tableName } from "./helpers";

describe("parties.ts — parties table (Req 2, 3)", () => {
  it("is named 'parties'", async () => {
    const { parties } = await import("../parties");
    expect(tableName(parties)).toBe("parties");
  });

  it("has code as notNull + unique", async () => {
    const { parties } = await import("../parties");
    const code = column(parties, "code");
    expect(code.notNull).toBe(true);
    expect(code.isUnique).toBe(true);
  });

  it("has name as notNull", async () => {
    const { parties } = await import("../parties");
    expect(column(parties, "name").notNull).toBe(true);
  });

  it("has nullable contact/regulatory fields: contactPerson, email, phone, taxId, address, notes", async () => {
    const { parties } = await import("../parties");
    for (const key of [
      "contactPerson",
      "email",
      "phone",
      "taxId",
      "address",
      "notes",
    ]) {
      expect(hasColumn(parties, key)).toBe(true);
      expect(column(parties, key).notNull).toBe(false);
    }
  });

  it("has isActive defaulting true and notNull", async () => {
    const { parties } = await import("../parties");
    const isActive = column(parties, "isActive");
    expect(isActive.notNull).toBe(true);
    expect(isActive.hasDefault).toBe(true);
  });

  it("has createdAt and updatedAt timestamps, notNull with defaults", async () => {
    const { parties } = await import("../parties");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(parties, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

describe("parties.ts — party_roles table (Req 3)", () => {
  it("is named 'party_roles'", async () => {
    const { partyRoles } = await import("../parties");
    expect(tableName(partyRoles)).toBe("party_roles");
  });

  it("has a notNull partyId FK referencing parties.id", async () => {
    const { partyRoles } = await import("../parties");
    const { referencesTable } = await import("./helpers");
    expect(column(partyRoles, "partyId").notNull).toBe(true);
    expect(referencesTable(partyRoles, "party_id", "parties", "id")).toBe(
      true,
    );
  });

  it("has a notNull role column typed as partyRoleEnum with the full role set", async () => {
    const { partyRoles } = await import("../parties");
    const role = column(partyRoles, "role");
    expect(role.notNull).toBe(true);
    expect(role.enumValues).toEqual([
      "vendor",
      "supplier",
      "customer",
      "end_customer",
      "internal_warehouse",
    ]);
  });
});
