// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const actions = vi.hoisted(() => ({ getUserAccess: vi.fn(), replaceUserRoles: vi.fn() }));
vi.mock("@/app/(authenticated)/settings/team/actions", () => actions);
import { UserAccessModal } from "../UserAccessModal";
import type { DynamicRole, TeamMember } from "@/app/(authenticated)/settings/team/actions";
const grant = { permissionId: "read", resource: "receiving", action: "view", scopeKind: "global" as const };
const roles: DynamicRole[] = [
  { id: "a", key: "reader", name: "Receiving reader", description: "Read receiving", color: "", isSystem: false, isActive: true, capabilities: [], grants: [grant] },
  { id: "b", key: "picker", name: "Picking operator", description: "Pick stock", color: "", isSystem: false, isActive: true, capabilities: [], grants: [grant, { permissionId: "pick", resource: "pick_list", action: "execute", scopeKind: "global" }] },
];
const member = { id: "worker", displayName: "Warehouse Operator", status: "active", roleKeys: ["reader"], partyNames: [] } as unknown as TeamMember;
beforeEach(() => {
  vi.clearAllMocks();
  actions.getUserAccess.mockResolvedValue({ ok: true, data: { roleIds: ["a"], grants: [grant] } });
  actions.replaceUserRoles.mockResolvedValue({ ok: true });
});
describe("UserAccessModal", () => {
  it("loads assignments and previews the deduplicated union across selected roles", async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<UserAccessModal isOpen onClose={() => {}} member={member} roles={roles} onSaved={saved} />);
    expect(await screen.findByRole("checkbox", { name: "Receiving reader" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Picking operator" }));
    expect(within(screen.getByRole("region", { name: "Proposed effective permissions" })).getAllByText("receiving.view")).toHaveLength(1);
    expect(screen.getByText("pick_list.execute")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save account access" })).toBeDisabled();
    await user.type(screen.getByLabelText("Reason for change"), "Assign picking duties");
    await user.click(screen.getByRole("checkbox", { name: /I confirm these access changes/ }));
    await user.click(screen.getByRole("button", { name: "Save account access" }));
    await waitFor(() => expect(actions.replaceUserRoles).toHaveBeenCalledWith({ userId: "worker", roleIds: ["a", "b"], reason: "Assign picking duties" }));
    expect(saved).toHaveBeenCalledOnce();
  });
  it("removing a role preserves grants from remaining roles", async () => {
    actions.getUserAccess.mockResolvedValue({ ok: true, data: { roleIds: ["a", "b"], grants: [grant] } });
    const user = userEvent.setup();
    render(<UserAccessModal isOpen onClose={() => {}} member={member} roles={roles} onSaved={() => {}} />);
    await user.click(await screen.findByRole("checkbox", { name: "Receiving reader" }));
    expect(within(screen.getByRole("region", { name: "Proposed effective permissions" })).getByText("receiving.view")).toBeInTheDocument();
    expect(screen.getByText("pick_list.execute")).toBeInTheDocument();
  });
  it("does not offer a save when assignment loading fails", async () => {
    actions.getUserAccess.mockResolvedValue({ ok: false, error: "Access cannot be loaded." });
    render(<UserAccessModal isOpen onClose={() => {}} member={member} roles={roles} onSaved={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Access cannot be loaded");
    expect(screen.queryByRole("button", { name: "Save account access" })).not.toBeInTheDocument();
  });
  it("keeps server-side denials visible without closing or updating local accounts", async () => {
    actions.replaceUserRoles.mockResolvedValue({ ok: false, error: "The last administrator cannot be removed." });
    const user = userEvent.setup();
    const close = vi.fn();
    const saved = vi.fn();
    render(<UserAccessModal isOpen onClose={close} member={member} roles={roles} onSaved={saved} />);
    await screen.findByRole("checkbox", { name: "Receiving reader" });
    await user.type(screen.getByLabelText("Reason for change"), "Review access");
    await user.click(screen.getByRole("checkbox", { name: /I confirm these access changes/ }));
    await user.click(screen.getByRole("button", { name: "Save account access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("last administrator");
    expect(close).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });
});


it("shows inactive accounts with no current permissions and a separate proposed bundle", async () => {
  render(<UserAccessModal isOpen onClose={() => {}} member={{ ...member, status: "inactive" }} roles={roles} onSaved={() => {}} />);
  await screen.findByRole("checkbox", { name: "Receiving reader" });
  const current = screen.getByRole("region", { name: "Current effective permissions" });
  expect(within(current).queryByText("receiving.view")).not.toBeInTheDocument();
  expect(within(current).getByText(/not active/)).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Proposed effective permissions" })).getByText("receiving.view")).toBeInTheDocument();
});

it("requires a reason of at least three characters even after confirmation", async () => {
  const user = userEvent.setup();
  render(<UserAccessModal isOpen onClose={() => {}} member={member} roles={roles} onSaved={() => {}} />);
  await screen.findByRole("checkbox", { name: "Receiving reader" });
  await user.type(screen.getByLabelText("Reason for change"), "ok");
  await user.click(screen.getByRole("checkbox", { name: /I confirm these access changes/ }));
  expect(screen.getByRole("button", { name: "Save account access" })).toBeDisabled();
  expect(screen.getByLabelText("Reason for change")).toHaveAttribute("maxLength", "1000");
});
