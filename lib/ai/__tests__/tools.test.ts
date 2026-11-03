import { beforeEach, describe, expect, it, vi } from "vitest";

const authz = vi.hoisted(() => ({ allowed: new Set<string>() }));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: vi.fn(async (_resolver: unknown, capability: string) => authz.allowed.has(capability)
    ? { kind: "authorized", context: { grants: [{ scopeKind: "global" }] } }
    : { kind: "forbidden" }),
}));

import { getAuthorizedToolDefinitions, getToolArgumentSchema } from "../tools";

function resolver(role: string) {
  return { getContext: async () => ({ kind: "authorized", context: { activeRoleKeys: [role], grants: [] } }) } as never;
}

describe("live assistant read tools", () => {
  beforeEach(() => authz.allowed.clear());

  it("offers only the read queries allowed by current global capabilities", async () => {
    authz.allowed.add("inventory.read");
    const tools = await getAuthorizedToolDefinitions(resolver("warehouse_staff"));
    expect(tools.map((entry) => entry.function.name)).toContain("get_stock_levels");
    expect(tools.map((entry) => entry.function.name)).toContain("get_recent_transactions");
    expect(tools.map((entry) => entry.function.name)).not.toContain("get_analytics_summary");
    expect(tools.every((entry) => !/create|update|delete|approve|dispatch/i.test(entry.function.name))).toBe(true);
  });

  it("does not expose any live tool to party accounts", async () => {
    authz.allowed.add("inventory.read");
    expect(await getAuthorizedToolDefinitions(resolver("party_user"))).toEqual([]);
  });

  it("rejects unknown fields and malformed live lookup arguments", () => {
    expect(getToolArgumentSchema("get_stock_levels").safeParse({ flow_type: "vmi", sql: "select *" }).success).toBe(false);
    expect(getToolArgumentSchema("get_lot_detail").safeParse({ lot_number: "" }).success).toBe(false);
    expect(getToolArgumentSchema("get_recent_transactions").safeParse({ item_code: "A", days: 365 }).success).toBe(false);
  });
});
