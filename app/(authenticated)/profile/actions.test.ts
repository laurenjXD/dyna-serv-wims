import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ updateUser: vi.fn(), transaction: vi.fn(), returning: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: { insert: () => ({ values: mock.audit }) } }));
vi.mock("@/lib/db/rls-pool", () => ({ rlsPool: {} }));
vi.mock("@/lib/auth/get-authenticated-session", () => ({ getAuthenticatedSession: vi.fn() }));
vi.mock("@/lib/auth/page-resolver", () => ({ createPageResolver: vi.fn() }));
vi.mock("@/lib/db/rls-transaction", () => ({ withRlsTransaction: mock.transaction }));
vi.mock("@/app/(authenticated)/settings/security/actions", () => ({ getEffectiveSecuritySettings: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: {
  getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }), updateUser: mock.updateUser,
} }) }));
import { updateProfileDetails } from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
  mock.updateUser.mockResolvedValue({ error: null });
  mock.returning.mockResolvedValue([{ id: "user-1" }]);
  mock.audit.mockResolvedValue(undefined);
  mock.transaction.mockImplementation(async (_deps, write) => ({ kind: "ok", value: await write({ db: { update: () => ({ set: () => ({ where: () => ({ returning: mock.returning }) }) }) } }) }));
});
it("reports a partial save when Auth succeeds but the database transaction fails", async () => {
  mock.transaction.mockRejectedValueOnce(new Error("database unavailable"));
  const result = await updateProfileDetails({ displayName: "Updated Name" });
  expect(mock.updateUser).toHaveBeenCalled();
  expect(result).toEqual({ ok: false, error: expect.stringContaining("were saved, but your profile name could not be updated everywhere") });
  expect(mock.audit).not.toHaveBeenCalled();
});
it("does not report full success when no profile row was updated", async () => {
  mock.returning.mockResolvedValueOnce([]);
  expect(await updateProfileDetails({ displayName: "Updated Name" })).toEqual({ ok: false, error: expect.stringContaining("were saved, but") });
});
it("reports full success only after a profile row is confirmed", async () => {
  expect(await updateProfileDetails({ displayName: "Updated Name" })).toEqual({ ok: true });
  expect(mock.returning).toHaveBeenCalled();
});
