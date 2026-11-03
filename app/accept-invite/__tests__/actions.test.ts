import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  profile: { id: "11111111-1111-4111-8111-111111111111", status: "invited" },
  activated: { id: "11111111-1111-4111-8111-111111111111" } as {id: string} | null,
  update: vi.fn(), eq: vi.fn(),
}));
vi.mock("@/app/(authenticated)/settings/security/actions", () => ({
  getEffectiveSecuritySettings: async () => ({ authRules: { passwordMinLength: 8, requireSpecialChars: false } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: {
    getUser: async () => ({ data: { user: { id: mock.profile.id } }, error: null }),
    updateUser: async () => ({ error: null }),
  } }),
  createServiceRoleClient: () => ({ from: () => {
    let updating = false;
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => { mock.eq(...args); return query; },
      maybeSingle: async () => ({ data: updating ? mock.activated : mock.profile, error: null }),
      update: (payload: unknown) => { updating = true; mock.update(payload); return query; },
      insert: async () => ({ error: null }),
    };
    return query;
  } }),
}));
import { completeInvitationAcceptance } from "../actions";
const input = { displayName: "Invited person", newPassword: "Testpass123!", confirmPassword: "Testpass123!" };

beforeEach(() => { vi.clearAllMocks(); mock.profile.status = "invited"; mock.activated = { id: mock.profile.id }; });

describe("invitation lifecycle race protection", () => {
  it("accepts only a still-invited profile with an updated-row confirmation", async () => {
    expect(await completeInvitationAcceptance(input)).toEqual({ ok: true });
    expect(mock.eq).toHaveBeenCalledWith("status", "invited");
  });
  it("cannot reactivate an invitation concurrently cancelled or suspended", async () => {
    mock.activated = null;
    expect((await completeInvitationAcceptance(input)).ok).toBe(false);
    expect(mock.eq).toHaveBeenCalledWith("status", "invited");
  });
  it("rejects inactive accounts before attempting activation", async () => {
    mock.profile.status = "inactive";
    expect((await completeInvitationAcceptance(input)).ok).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
  });
});
