// @vitest-environment jsdom
//
// Tests <AccountTab>'s real form-validation/submission logic (specs/21's
// Task 21.2), including that the server action is only invoked once Zod
// validation actually passes.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OwnProfile } from "@/app/(authenticated)/profile/actions";

type UpdateDisplayNameResult = { ok: true } | { ok: false; error: string };

const updateDisplayNameMock = vi.fn(
  async (_input: { displayName: string }): Promise<UpdateDisplayNameResult> => ({ ok: true }),
);

vi.mock("@/app/(authenticated)/profile/actions", () => ({
  updateDisplayName: (input: { displayName: string }) => updateDisplayNameMock(input),
}));

import { AccountTab } from "../AccountTab";

const profile: OwnProfile = {
  id: "user-1",
  email: "user@example.com",
  displayName: "Jane Doe",
  status: "active",
  lastSignInAt: null,
};

describe("AccountTab (Task 21.2)", () => {
  beforeEach(() => {
    updateDisplayNameMock.mockClear();
  });

  it("renders email as read-only (FR-1.2)", () => {
    render(<AccountTab profile={profile} />);
    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    expect(emailInput).toBeDisabled();
    expect(emailInput.value).toBe("user@example.com");
  });

  it("renders contact number as disabled (no backing column yet — seam gap)", () => {
    render(<AccountTab profile={profile} />);
    const contactInput = screen.getByLabelText("Contact number") as HTMLInputElement;
    expect(contactInput).toBeDisabled();
  });

  it("blocks submission and shows an error for a too-short display name, without calling the server action", async () => {
    const user = userEvent.setup();
    render(<AccountTab profile={profile} />);

    const input = screen.getByTestId("display-name-input");
    await user.clear(input);
    await user.type(input, "J");
    await user.click(screen.getByTestId("save-display-name"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 2 characters/i);
    expect(updateDisplayNameMock).not.toHaveBeenCalled();
  });

  it("calls the server action and shows a saved confirmation for a valid display name", async () => {
    const user = userEvent.setup();
    render(<AccountTab profile={profile} />);

    const input = screen.getByTestId("display-name-input");
    await user.clear(input);
    await user.type(input, "Jane Smith");
    await user.click(screen.getByTestId("save-display-name"));

    expect(updateDisplayNameMock).toHaveBeenCalledWith({ displayName: "Jane Smith" });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("surfaces a server-reported error without swallowing it", async () => {
    updateDisplayNameMock.mockResolvedValueOnce({ ok: false, error: "Server rejected update" });
    const user = userEvent.setup();
    render(<AccountTab profile={profile} />);

    const input = screen.getByTestId("display-name-input");
    await user.clear(input);
    await user.type(input, "Jane Smith");
    await user.click(screen.getByTestId("save-display-name"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Server rejected update");
  });
});
