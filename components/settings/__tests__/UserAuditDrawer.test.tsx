// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TeamMember } from "@/app/(authenticated)/settings/team/actions";
const actions = vi.hoisted(() => ({ getUserAuditTrail: vi.fn(), revokeUserSession: vi.fn() }));
vi.mock("@/app/(authenticated)/settings/team/actions", () => actions);
import { UserAuditDrawer } from "../UserAuditDrawer";

afterEach(() => vi.restoreAllMocks());

it("shows a refused session revocation without announcing success", async () => {
  actions.getUserAuditTrail.mockResolvedValue({ ok: true, data: [] });
  actions.revokeUserSession.mockResolvedValue({ ok: false, error: "Session-only revocation is unavailable. Suspend the account to block its next protected request." });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const member = { id: "worker", displayName: "Warehouse Operator", roleKeys: [], status: "active", sessionStatus: "connected", activeDevice: "Handheld", sessionUuid: "session", employeeId: "EMP-1", phone: "", avatarUrl: null, partyNames: [], lastSignInAt: null, email: "worker@example.com" } as unknown as TeamMember;
  render(<UserAuditDrawer user={member} onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Revoke Device Session" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Session-only revocation is unavailable");
  expect(screen.queryByText("Device session revoked successfully.")).not.toBeInTheDocument();
});
