// @vitest-environment jsdom
//
// Tests <UserManagementGrid>'s search/filter and suspend/reactivate logic
// (specs/21-user-profile-and-settings design.md §1.2, §2.2, tasks.md Tasks
// 21.6/21.8). FR-3.1 ("searchable, filterable data grid").

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserManagementGrid } from "../UserManagementGrid";
import type { TeamMember } from "@/app/(authenticated)/settings/team/actions";

const members: TeamMember[] = [
  {
    id: "u1",
    email: "jane@example.com",
    displayName: "Jane Staff",
    status: "active",
    roleKeys: ["warehouse_staff"],
    partyNames: [],
    lastSignInAt: null,
  },
  {
    id: "u2",
    email: "vendor@example.com",
    displayName: "Vendor Contact",
    status: "invited",
    roleKeys: ["party_user"],
    partyNames: ["UBoT"],
    lastSignInAt: null,
  },
];

function noop() {
  return Promise.resolve({ ok: true });
}

describe("UserManagementGrid (FR-3.1, Task 21.6/21.8)", () => {
  it("renders every member row initially", () => {
    render(
      <UserManagementGrid
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
      <UserManagementGrid
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
      <UserManagementGrid
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
      <UserManagementGrid
        initialMembers={members}
        parties={[]}
        inviteUser={noop}
        suspendUser={noop}
        reactivateUser={noop}
      />,
    );

    await user.type(screen.getByTestId("team-search-input"), "nobody-matches-this");

    expect(screen.getByText("No team members match your search.")).toBeInTheDocument();
  });

  it("opens the Invite User modal from the header button", async () => {
    const user = userEvent.setup();
    render(
      <UserManagementGrid
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
      <UserManagementGrid
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
      <UserManagementGrid
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
});
