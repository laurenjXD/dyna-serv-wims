import { describe, expect, it } from "vitest";
import { requirePermission } from "../guard";
import {
  createRequestAuthorizationResolver,
  type Grant,
  type RawAuthorizationRecord,
} from "../session";

// Exercise the real resolver and guard together. Database filtering and RLS
// require separate integration coverage; these fixtures are already-resolved
// active assignments, not a simulation of SQL validity/revocation filtering.
const global = (resource: string, action: string): Grant => ({ resource, action, scopeKind: "global" });
const scoped = (resource: string, action: string): Grant => ({ resource, action, scopeKind: "assigned_party" });
const receiving = global("receiving", "view");
const picking = global("pick_list", "execute");
const finance = global("reporting", "financial_read");
const organization = scoped("pick_list", "read");

function record(roles: string[], grants: Grant[]): RawAuthorizationRecord {
  return { profileStatus: "active", activeRoleKeys: roles, grants, partyScopes: [] };
}

const accounts = {
  receiver: record(["custom_receiver"], [receiving]),
  picker: record(["custom_picker"], [picking]),
  combined: record(["custom_receiver", "custom_picker"], [receiving, picking, receiving]),
  finance: record(["custom_finance_reader"], [finance]),
  empty: record(["custom_empty"], []),
  misleadingAdminName: record(["administrator"], []),
  organizationA: { ...record(["custom_customer"], [organization]), partyScopes: [{ partyId: "org-a", flowType: "vmi" as const }] },
  inactive: { ...record(["custom_receiver"], [receiving]), profileStatus: "inactive" as const },
};

function resolver(userId: string, load: () => RawAuthorizationRecord | null) {
  return createRequestAuthorizationResolver({
    getAuthenticatedSession: async () => ({ userId }),
    loadAuthorizationRecord: async (id) => {
      expect(id).toBe(userId);
      return load();
    },
  });
}

const cases: { capability: string; scope?: { partyId: string; flowType: "vmi" | "trading" | "supplies" }; allowed: string[] }[] = [
  { capability: "receiving.view", allowed: ["receiver", "combined"] },
  { capability: "pick_list.execute", allowed: ["picker", "combined"] },
  { capability: "reporting.financial_read", allowed: ["finance"] },
  { capability: "users.activate", allowed: [] },
  { capability: "pick_list.read", scope: { partyId: "org-a", flowType: "vmi" as const }, allowed: ["organizationA"] },
  { capability: "pick_list.read", scope: { partyId: "org-b", flowType: "vmi" as const }, allowed: [] },
  { capability: "pick_list.read", scope: { partyId: "org-a", flowType: "trading" as const }, allowed: [] },
  { capability: "pick_list.read", scope: { partyId: "org-a", flowType: "supplies" as const }, allowed: [] },
];

describe("dynamic per-account capability isolation", () => {
  for (const [userId, data] of Object.entries(accounts)) {
    for (const testCase of cases) {
      it(`${userId}: ${testCase.capability} ${JSON.stringify(testCase.scope ?? {})}`, async () => {
        const result = await requirePermission(resolver(userId, () => data), testCase.capability, testCase.scope);
        expect(result.kind).toBe(testCase.allowed.includes(userId) ? "authorized" : "forbidden");
      });
    }
  }

  it("removing one role preserves overlapping grants from the remaining role on the next request", async () => {
    let current = record(["custom_a", "custom_b"], [receiving, picking, receiving]);
    const firstRequest = resolver("worker", () => current);
    expect((await requirePermission(firstRequest, "pick_list.execute")).kind).toBe("authorized");
    const initial = await firstRequest.getContext();
    expect(initial.kind === "authorized" && initial.context.grants).toHaveLength(2);
    current = record(["custom_b"], [receiving]);
    const nextRequest = resolver("worker", () => current);
    expect((await requirePermission(nextRequest, "pick_list.execute")).kind).toBe("forbidden");
    expect((await requirePermission(nextRequest, "receiving.view")).kind).toBe("authorized");
  });

  it("changes a role's grants without requiring a new login", async () => {
    let current = record(["custom_receiver"], [receiving]);
    expect((await requirePermission(resolver("worker", () => current), "receiving.view")).kind).toBe("authorized");
    current = record(["custom_receiver"], [picking]);
    const nextRequest = resolver("worker", () => current);
    expect((await requirePermission(nextRequest, "receiving.view")).kind).toBe("forbidden");
    expect((await requirePermission(nextRequest, "pick_list.execute")).kind).toBe("authorized");
  });

  it("deactivation and scope removal deny the next protected request", async () => {
    let current: RawAuthorizationRecord = accounts.organizationA;
    const target = { partyId: "org-a", flowType: "vmi" as const };
    expect((await requirePermission(resolver("customer", () => current), "pick_list.read", target)).kind).toBe("authorized");
    current = { ...current, partyScopes: [] };
    expect(await requirePermission(resolver("customer", () => current), "pick_list.read", target)).toMatchObject({ kind: "forbidden", reason: "scope_mismatch" });
    current = { ...accounts.organizationA, profileStatus: "inactive" };
    expect(await requirePermission(resolver("customer", () => current), "pick_list.read", target)).toMatchObject({ kind: "forbidden", reason: "inactive_profile" });
  });

  it("concurrent account requests never share grants or identity", async () => {
    const [a, b] = await Promise.all([
      resolver("receiver", () => accounts.receiver).getContext(),
      resolver("finance", () => accounts.finance).getContext(),
    ]);
    expect(a).toMatchObject({ kind: "authorized", context: { userId: "receiver", grants: [receiving] } });
    expect(b).toMatchObject({ kind: "authorized", context: { userId: "finance", grants: [finance] } });
  });
});

