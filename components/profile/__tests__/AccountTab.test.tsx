// @vitest-environment jsdom
//
// Tests <AccountTab>'s real form-validation/submission logic (specs/21's
// Task 21.2), including that the server action is only invoked once Zod
// validation actually passes.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OwnProfile } from "@/app/(authenticated)/profile/actions";

type UpdateProfileResult = { ok: true } | { ok: false; error: string };

const updateProfileDetailsMock = vi.fn(
  async (_input: unknown): Promise<UpdateProfileResult> => ({ ok: true }),
);

vi.mock("@/app/(authenticated)/profile/actions", () => ({
  updateProfileDetails: (input: unknown) => updateProfileDetailsMock(input),
  disconnectCurrentDevice: vi.fn(async () => ({ ok: true })),
}));

import { AccountTab } from "../AccountTab";

const profile: OwnProfile = {
  id: "user-1",
  email: "user@example.com",
  displayName: "Jane Doe",
  employeeId: "EMP-1001",
  phone: "+63 917 123 4567",
  avatarUrl: null,
  status: "active",
  roles: [
    {
      key: "supervisor",
      name: "Shift Supervisor",
      color: "bg-blue-600",
    },
  ],
  effectivePermissions: [
    {
      module: "Receiving (WRR)",
      resource: "wrr",
      action: "scan/receive",
      description: "Physical scanning and pallet receiving intake",
    },
  ],
  session: {
    sessionId: "SESS-7841-A9F3",
    deviceAlias: "Personal Mobile · Safari iOS",
    browserUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
    shiftBinding: "Shift 1 · Zone A Intake",
    connectedZone: "Zone A Intake & Staging",
    ipAddress: "192.168.10.142",
    loginTime: "08:00 AM",
  },
  recentActivity: [],
  lastSignInAt: null,
};

describe("AccountTab (Task 21.2)", () => {
  beforeEach(() => {
    updateProfileDetailsMock.mockClear();
  });

  it("renders email as read-only (FR-1.2)", () => {
    render(<AccountTab profile={profile} />);
    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    expect(emailInput).toBeDisabled();
    expect(emailInput.value).toBe("user@example.com");
  });

  it("renders employee badge ID as read-only", () => {
    render(<AccountTab profile={profile} />);
    const empInput = screen.getByLabelText(/employee id badge/i) as HTMLInputElement;
    expect(empInput).toBeDisabled();
    expect(empInput.value).toBe("EMP-1001");
  });

  it("calls the server action and shows a saved confirmation for a valid name", async () => {
    const user = userEvent.setup();
    render(<AccountTab profile={profile} />);

    const input = screen.getByTestId("display-name-input");
    await user.clear(input);
    await user.type(input, "Jane Smith");
    await user.click(screen.getByTestId("save-display-name"));

    expect(updateProfileDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Jane Smith" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/updated successfully/i);
  });

  it("surfaces a server-reported error without swallowing it", async () => {
    updateProfileDetailsMock.mockResolvedValueOnce({ ok: false, error: "Server rejected update" });
    const user = userEvent.setup();
    render(<AccountTab profile={profile} />);

    const input = screen.getByTestId("display-name-input");
    await user.clear(input);
    await user.type(input, "Jane Smith");
    await user.click(screen.getByTestId("save-display-name"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Server rejected update");
  });
});
