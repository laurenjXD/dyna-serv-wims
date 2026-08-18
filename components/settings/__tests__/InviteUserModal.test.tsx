// @vitest-environment jsdom
//
// Tests <InviteUserModal>'s conditional party_id UI and Zod validation
// (specs/21-user-profile-and-settings design.md §2.1 step 5, FR-4.2/FR-4.3,
// tasks.md Task 21.7).

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteUserModal } from "../InviteUserModal";

const parties = [
  { id: "3e2f6f3a-8f77-4a6a-9a8f-1a2b3c4d5e6f", name: "UBoT" },
  { id: "4f3f6f3a-8f77-4a6a-9a8f-1a2b3c4d5e70", name: "Acme Corp" },
];

describe("InviteUserModal (design.md §2.1, FR-4.2/FR-4.3)", () => {
  it("does not show the party field for the default (non party_user) role", () => {
    render(<InviteUserModal parties={parties} onClose={() => {}} onInvite={vi.fn()} />);
    expect(screen.queryByTestId("invite-party-field")).not.toBeInTheDocument();
  });

  it("fades in the party field only when role is set to Organization Client", async () => {
    const user = userEvent.setup();
    render(<InviteUserModal parties={parties} onClose={() => {}} onInvite={vi.fn()} />);

    await user.selectOptions(screen.getByTestId("invite-role-select"), "party_user");

    expect(screen.getByTestId("invite-party-field")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "UBoT" })).toBeInTheDocument();
  });

  it("blocks submission with a validation error when party_user has no partyId selected (FR-4.3)", async () => {
    const onInvite = vi.fn();
    const user = userEvent.setup();
    render(<InviteUserModal parties={parties} onClose={() => {}} onInvite={onInvite} />);

    await user.type(screen.getByTestId("invite-email-input"), "vendor@example.com");
    await user.type(screen.getByTestId("invite-display-name-input"), "Vendor Contact");
    await user.selectOptions(screen.getByTestId("invite-role-select"), "party_user");
    await user.click(screen.getByTestId("invite-submit"));

    expect(await screen.findByText(/must be assigned to a specific Organization/i)).toBeInTheDocument();
    expect(onInvite).not.toHaveBeenCalled();
  });

  it("submits successfully for a valid non-party_user invite and calls onClose", async () => {
    const onInvite = vi.fn(async () => ({ ok: true }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<InviteUserModal parties={parties} onClose={onClose} onInvite={onInvite} />);

    await user.type(screen.getByTestId("invite-email-input"), "staff@example.com");
    await user.type(screen.getByTestId("invite-display-name-input"), "Jane Staff");
    await user.click(screen.getByTestId("invite-submit"));

    await waitFor(() =>
      expect(onInvite).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "staff@example.com",
          displayName: "Jane Staff",
          role: "warehouse_staff",
        }),
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("submits successfully for a valid party_user invite with a selected party", async () => {
    const onInvite = vi.fn(async () => ({ ok: true }));
    const user = userEvent.setup();
    render(<InviteUserModal parties={parties} onClose={() => {}} onInvite={onInvite} />);

    await user.type(screen.getByTestId("invite-email-input"), "vendor@example.com");
    await user.type(screen.getByTestId("invite-display-name-input"), "Vendor Contact");
    await user.selectOptions(screen.getByTestId("invite-role-select"), "party_user");
    await user.selectOptions(screen.getByTestId("invite-party-select"), parties[0].id);
    await user.click(screen.getByTestId("invite-submit"));

    await waitFor(() =>
      expect(onInvite).toHaveBeenCalledWith(
        expect.objectContaining({ role: "party_user", partyId: parties[0].id }),
      ),
    );
  });

  it("shows a server-reported error without closing the modal", async () => {
    const onInvite = vi.fn(async () => ({ ok: false, error: "Email already invited" }));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<InviteUserModal parties={parties} onClose={onClose} onInvite={onInvite} />);

    await user.type(screen.getByTestId("invite-email-input"), "staff@example.com");
    await user.type(screen.getByTestId("invite-display-name-input"), "Jane Staff");
    await user.click(screen.getByTestId("invite-submit"));

    expect(await screen.findByText("Email already invited")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
