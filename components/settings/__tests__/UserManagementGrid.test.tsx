// @vitest-environment jsdom
//
// Tests <UserManagementGrid canManageAccess>'s search/filter and suspend/reactivate logic
// (specs/21-user-profile-and-settings design.md Â§1.2, Â§2.2, tasks.md Tasks
// 21.6/21.8). FR-3.1 ("searchable, filterable data grid").

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(authenticated)/settings/team/actions", () => ({
  getUserAccess: vi.fn().mockResolvedValue({ ok: true, data: { roleIds: [], grants: [] } }),
  replaceUserRoles: vi.fn().mockResolvedValue({ ok: true }),
  listRoles: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  listTeamMembers: vi.fn().mockResolvedValue({ ok: false, error: "test fixture refresh disabled" }),
  resendInvite: vi.fn().mockResolvedValue({ ok: true }),
  cancelInvite: vi.fn().mockResolvedValue({ ok: true }),
}));

import { UserManagementGrid } from "../UserManagementGrid";
import type { TeamMember } from "@/app/(authenticated)/settings/team/actions";

const members: TeamMember[] = [
  {
    id: "u1",
    email: "jane@example.com",
    displayName: "Jane Staff",
    employeeId: "EMP-4011",
    phone: "+63 917 111 2222",
    avatarUrl: null,
    status: "active",
    roleKeys: ["warehouse_staff"],
    partyNames: [],
    activeDevice: "BYOD Mobile Â· Safari iOS",
    sessionStatus: "connected",
    sessionUuid: "SESS-4011-B891",
    lastSignInAt: null,
  },
  {
    id: "u2",
    email: "vendor@example.com",
    displayName: "Vendor Contact",
    employeeId: "EMP-9022",
    phone: "+63 918 333 4444",
    avatarUrl: null,
    status: "invited",
    roleKeys: ["party_user"],
    partyNames: ["UBoT"],
    activeDevice: "â€”",
    sessionStatus: "offline",
    sessionUuid: "â€”",
    lastSignInAt: null,
  },
];

function noop() {
  return Promise.resolve({ ok: true });
}

describe("UserManagementGrid (FR-3.1, Task 21.6/21.8)", () => {
  it("renders every member row initially", () => {
    render(
      <UserManagementGrid canManageAccess
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={noop}
      />,
    );
    expect(screen.getByText("Jane Staff")).toBeInTheDocument();
    expect(screen.getByText("Vendor Contact")).toBeInTheDocument();
  });

  it("filters rows by search query across name and email", async () => {
    const user = userEvent.setup();
    render(
      <UserManagementGrid canManageAccess
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={noop}
      />,
    );

    await user.type(screen.getByTestId("team-search-input"), "vendor");

    expect(screen.queryByText("Jane Staff")).not.toBeInTheDocument();
    expect(screen.getByText("Vendor Contact")).toBeInTheDocument();
  });

  it("filters rows by status", async () => {
    const user = userEvent.setup();
    render(
      <UserManagementGrid canManageAccess
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={noop}
      />,
    );

    await user.selectOptions(screen.getByTestId("team-status-filter"), "invited");

    expect(screen.queryByText("Jane Staff")).not.toBeInTheDocument();
    expect(screen.getByText("Vendor Contact")).toBeInTheDocument();
  });

  it("shows an empty-state row when the search matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <UserManagementGrid canManageAccess
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={noop}
      />,
    );

    await user.type(screen.getByTestId("team-search-input"), "nobody-matches-this");

    expect(screen.getByText("No team members match your search. Clear the search or change the filters.")).toBeInTheDocument();
  });

  it("opens the Invite User modal from the header button", async () => {
    const user = userEvent.setup();
    render(
      <UserManagementGrid canManageAccess
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={noop}
      />,
    );

    expect(screen.queryByTestId("invite-user-modal")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("open-invite-user"));
    expect(screen.getByTestId("invite-user-modal")).toBeInTheDocument();
  });

  it("opens the suspend confirmation dialog for an active user and updates status on confirm", async () => {
    const suspendUser = vi.fn(async () => ({ ok: true }));
    const user = userEvent.setup();
    render(
      <UserManagementGrid canManageAccess
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={suspendUser}
        reactivateUser={noop}
      />,
    );

    await user.click(screen.getByTestId("suspend-u1"));
    expect(screen.getByTestId("suspend-user-dialog")).toBeInTheDocument();

    await user.type(screen.getByTestId("suspend-reason-input"), "Left the company");
    await user.click(screen.getByTestId("suspend-confirm"));

    await waitFor(() =>
      expect(suspendUser).toHaveBeenCalledWith({ userId: "u1", reason: "Left the company" }),
    );
    await waitFor(() => expect(screen.queryByTestId("suspend-user-dialog")).not.toBeInTheDocument());

    const janeRow = screen.getByText("Jane Staff").closest("tr")!;
    expect(within(janeRow).getByText("inactive")).toBeInTheDocument();
    expect(within(janeRow).getByTestId("reactivate-u1")).toBeInTheDocument();
  });

  it("reactivates an inactive user without a confirmation dialog", async () => {
    const reactivateUser = vi.fn(async () => ({ ok: true }));
    const inactiveMembers: TeamMember[] = [
      { ...members[0], status: "inactive" },
    ];
    const user = userEvent.setup();
    render(
      <UserManagementGrid canManageAccess
        initialMembers={inactiveMembers}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={reactivateUser}
      />,
    );

    await user.click(screen.getByTestId("reactivate-u1"));

    await waitFor(() => expect(reactivateUser).toHaveBeenCalledWith("u1"));
    const janeRow = screen.getByText("Jane Staff").closest("tr")!;
    await waitFor(() => expect(within(janeRow).getByText("active")).toBeInTheDocument());
  });

  it("resends an invite link for an invited user", async () => {
    const resendInvite = vi.fn(async () => ({ ok: true }));
    const user = userEvent.setup();
    render(
      <UserManagementGrid canManageAccess
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={noop}
        resendInvite={resendInvite}
        cancelInvite={noop}
      />,
    );

    const resendBtn = screen.getByTestId("resend-invite-u2");
    expect(resendBtn).toBeInTheDocument();
    await user.click(resendBtn);

    await waitFor(() => expect(resendInvite).toHaveBeenCalledWith("u2"));
    expect(
      screen.getByText(/Invitation sent to vendor@example\.com/i),
    ).toBeInTheDocument();
  });

  it("cancels an invite after confirmation and retains an inactive account", async () => {
    const cancelInvite = vi.fn(async () => ({ ok: true }));
    const user = userEvent.setup();
    render(
      <UserManagementGrid canManageAccess
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={noop}
        resendInvite={noop}
        cancelInvite={cancelInvite}
      />,
    );

    const cancelBtn = screen.getByTestId("cancel-invite-u2");
    expect(cancelBtn).toBeInTheDocument();
    await user.click(cancelBtn);

    expect(screen.getByTestId("cancel-invite-dialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("cancel-invite-confirm"));

    await waitFor(() => expect(cancelInvite).toHaveBeenCalledWith("u2"));
    await waitFor(() =>
      expect(screen.queryByTestId("cancel-invite-dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Vendor Contact")).toBeInTheDocument();
    expect(within(screen.getByText("Vendor Contact").closest("tr")!).getByText("inactive")).toBeInTheDocument();
  });
});




it("hides invitation and access mutation entry points from a read-only account", () => {
  render(<UserManagementGrid initialMembers={members} parties={[]} inviteUser={noop} suspendUser={noop} reactivateUser={noop} />);
  expect(screen.queryByTestId("open-invite-user")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Manage Access" })).not.toBeInTheDocument();
});

it("opens a specific account's multi-role access editor for an administrator", async () => {
  const user = userEvent.setup();
  render(<UserManagementGrid canManageAccess initialMembers={members} parties={[]} inviteUser={noop} suspendUser={noop} reactivateUser={noop} />);
  const row = screen.getByText("Jane Staff").closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Manage Access" }));
  expect(await screen.findByRole("dialog", { name: "Account access: Jane Staff" })).toBeInTheDocument();
  expect(await screen.findByText("No active roles are available.")).toBeInTheDocument();
});
