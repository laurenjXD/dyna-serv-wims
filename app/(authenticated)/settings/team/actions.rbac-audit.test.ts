import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestAuthorizationResolver } from "@/lib/rbac/session";
import type { Grant } from "@/lib/rbac/session";

const actorId = "11111111-1111-4111-8111-111111111111";
const roleId = "22222222-2222-4222-8222-222222222222";
const permissionId = "33333333-3333-4333-8333-333333333333";
const mock = vi.hoisted(() => ({
  grants: [] as Grant[], roleKeys: ["administrator"],
  execute: vi.fn(), transaction: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ db: { transaction: mock.transaction } }));
vi.mock("@/lib/auth/page-resolver", () => ({ createPageResolver: async () => createRequestAuthorizationResolver({
  getAuthenticatedSession: async () => ({ userId: actorId }),
  loadAuthorizationRecord: async () => ({ profileStatus: "active", activeRoleKeys: mock.roleKeys, grants: mock.grants, partyScopes: [] }),
}) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { deleteDynamicRole, listRoles, saveDynamicRole, replaceUserRoles, getUserAccess, listPermissionCatalog, inviteUser, suspendUser, reactivateUser, cancelInvite, revokeUserSession } from "./actions";
import { saveRoleSchema, replaceUserRolesSchema } from "@/lib/rbac/admin-schemas";

const input = { key: "custom_receiver", name: "Receiver", description: "Scoped receiving", grants: [{ permissionId, scopeKind: "assigned_party" as const }], reason: "Shift access reviewed" };
const grant = (resource: string, action: string): Grant => ({ resource, action, scopeKind: "global" });
const adminGrants = [grant("access_assignments", "read"), grant("access_assignments", "grant"), grant("access_assignments", "revoke")];

beforeEach(() => {
  vi.clearAllMocks(); mock.roleKeys = ["administrator"]; mock.grants = adminGrants;
  mock.execute.mockReset().mockResolvedValue([]);
  mock.transaction.mockImplementation(async (fn: (tx: {execute: typeof mock.execute}) => unknown) => fn({ execute: mock.execute }));
});

describe("dynamic role administration regressions", () => {
  it("RBAC-01: account activation alone cannot administer roles", async () => {
    mock.grants = [grant("users", "activate")];
    expect((await saveDynamicRole(input)).ok).toBe(false);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("requires both grant and revoke authority for complete replacement", async () => {
    mock.grants = [grant("access_assignments", "grant")];
    expect((await saveDynamicRole(input)).ok).toBe(false);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("does not delegate protected administration to arbitrary role keys", async () => {
    mock.roleKeys = ["custom_admin"];
    expect((await saveDynamicRole(input)).ok).toBe(false);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("RBAC-02: rejects obsolete module-checkbox payloads and duplicate/malformed grants", async () => {
    expect((await saveDynamicRole({ ...input, capabilities: [] } as never)).ok).toBe(false);
    expect(saveRoleSchema.safeParse({ ...input, grants: [input.grants[0], input.grants[0]] }).success).toBe(false);
    expect(saveRoleSchema.safeParse({ ...input, grants: [{ permissionId: "bad", scopeKind: "global" }] }).success).toBe(false);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("RBAC-02: database catalog validation errors fail the whole save", async () => {
    mock.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("Unsupported permission/scope"));
    expect((await saveDynamicRole(input)).ok).toBe(false);
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("RBAC-03: binds the authenticated actor and preserves explicitly scoped grants", async () => {
    mock.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: roleId }]);
    expect((await saveDynamicRole(input)).ok).toBe(true);
    // Inspect bound parameters, never concatenate user values into executable SQL.
    const queries = mock.execute.mock.calls.map(([query]) => query);
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const rendered = queries.map((query) => new PgDialect().sqlToQuery(query));
    expect(rendered[0].params).toContain("authenticated");
    expect(rendered[1].params).toContain(JSON.stringify({ sub: actorId }));
    const payload = rendered[2].params.find((value) => typeof value === "string" && value.startsWith("[{"));
    expect(JSON.parse(String(payload))).toEqual(input.grants);
  });
  it("RBAC-04: empty database role grants stay empty", async () => {
    mock.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ data: [{ id: roleId, key: input.key, name: input.name, description: "", isSystem: false, isActive: true, grants: [] }] }]);
    const result = await listRoles();
    expect(result.ok && result.data[0].grants).toEqual([]);
    expect(result.ok && result.data[0].capabilities).toEqual([]);
  });
  it("RBAC-05: catalog failure returns an error without fabricated roles", async () => {
    mock.transaction.mockRejectedValueOnce(new Error("offline"));
    expect((await listRoles()).ok).toBe(false);
    expect((await listPermissionCatalog()).ok).toBe(true);
  });
  it("RBAC-06: deactivation delegates audit and mutation to one database command", async () => {
    expect((await deleteDynamicRole(roleId, "No longer used")).ok).toBe(true);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.execute).toHaveBeenCalledTimes(3);
  });
  it("RBAC-07: database audit failure never reports successful save", async () => {
    mock.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("audit unavailable"));
    expect((await saveDynamicRole(input)).ok).toBe(false);
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("rejects missing confirmation reasons and role IDs", async () => {
    expect((await deleteDynamicRole("not-a-uuid", "x")).ok).toBe(false);
    expect((await saveDynamicRole({ ...input, reason: "" })).ok).toBe(false);
    expect(replaceUserRolesSchema.safeParse({ userId: actorId, roleIds: [roleId, roleId], reason: "Reviewed" }).success).toBe(false);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("replaces multiple account roles through the same actor-bound command", async () => {
    expect((await replaceUserRoles({ userId: actorId, roleIds: [roleId], reason: "Reviewed" })).ok).toBe(true);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
  });
  it("protects access inspection without read permission", async () => {
    mock.grants = [];
    expect((await getUserAccess(actorId)).ok).toBe(false);
    expect((await listRoles()).ok).toBe(false);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});

describe("account lifecycle authorization", () => {
  it("a custom inviter cannot assign a protected administrator role", async () => {
    mock.grants = [grant("users", "invite"), ...adminGrants]; mock.roleKeys = ["custom_inviter"];
    expect((await inviteUser({email:"test@example.com",displayName:"Test User",role:"administrator"})).ok).toBe(false);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("account suspension and reactivation use actor-bound commands", async () => {
    mock.grants = [...adminGrants, grant("users", "activate"), grant("users", "deactivate")];
    expect((await suspendUser({userId: roleId,reason:"Access suspended after review"})).ok).toBe(true);
    expect((await reactivateUser(roleId)).ok).toBe(true);
    expect(mock.transaction).toHaveBeenCalledTimes(2);
  });
  it("invitation cancellation delegates its status check, revocation and audit atomically", async () => {
    expect((await cancelInvite(roleId)).ok).toBe(true);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.execute).toHaveBeenCalledTimes(3);
  });
  it("never reports session-only revocation success without performing it", async () => {
    mock.grants = [grant("users", "deactivate")];
    expect(await revokeUserSession(roleId)).toMatchObject({ok:false,error:expect.stringContaining("Suspend")});
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});