// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const actions = vi.hoisted(() => ({
  listPermissionCatalog: vi.fn(), saveDynamicRole: vi.fn(), deleteDynamicRole: vi.fn(),
}));
vi.mock("@/app/(authenticated)/settings/team/actions", () => actions);
import { RoleManagementModal } from "../RoleManagementModal";
import type { DynamicRole } from "@/app/(authenticated)/settings/team/actions";
const grant = { permissionId: "permission-1", resource: "receiving", action: "view", scopeKind: "global" as const };
const system: DynamicRole = { id: "role-staff", key: "warehouse_staff", name: "Warehouse Staff", description: "Floor work", color: "", isSystem: true, isActive: true, grants: [grant], capabilities: [] };
const custom: DynamicRole = { ...system, id: "role-custom", key: "receiver", name: "Receiver", isSystem: false };
beforeEach(() => {
  vi.clearAllMocks();
  actions.listPermissionCatalog.mockResolvedValue({ ok: true, data: [{ ...grant, description: "View receiving" }] });
  actions.saveDynamicRole.mockResolvedValue({ ok: true });
  actions.deleteDynamicRole.mockResolvedValue({ ok: true });
});
describe("RoleManagementModal dynamic RBAC", () => {
  it("shows exact built-in grants without permitting edits", () => {
    render(<RoleManagementModal isOpen onClose={() => {}} roles={[system]} canManageAccess />);
    expect(screen.getByText("receiving.view")).toBeInTheDocument();
    expect(screen.getByText("Warehouse-wide")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save role" })).not.toBeInTheDocument();
    expect(actions.listPermissionCatalog).not.toHaveBeenCalled();
  });
  it("does not offer custom role management to a read-only viewer", () => {
    render(<RoleManagementModal isOpen onClose={() => {}} roles={[custom]} />);
    expect(screen.queryByRole("button", { name: "Create role" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save role" })).not.toBeInTheDocument();
  });
  it("submits explicit grant identifiers only after reason and confirmation", async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<RoleManagementModal isOpen onClose={() => {}} roles={[system]} canManageAccess onSaved={saved} />);
    await user.click(screen.getByRole("button", { name: "Create role" }));
    await user.type(screen.getByLabelText("Role key"), "receiving_reader");
    await user.type(screen.getByLabelText("Role name"), "Receiving reader");
    await user.click(await screen.findByRole("checkbox", { name: "receiving.view — Warehouse-wide" }));
    expect(screen.getByRole("button", { name: "Save role" })).toBeDisabled();
    await user.type(screen.getByLabelText("Reason for change"), "Restrict receiving access");
    await user.click(screen.getByRole("checkbox", { name: /I confirm these access changes/ }));
    await user.click(screen.getByRole("button", { name: "Save role" }));
    await waitFor(() => expect(actions.saveDynamicRole).toHaveBeenCalledWith({ key: "receiving_reader", name: "Receiving reader", description: "", grants: [{ permissionId: "permission-1", scopeKind: "global" }], reason: "Restrict receiving access" }));
    expect(saved).toHaveBeenCalledOnce();
  });
  it("keeps failed saves visible and does not announce success", async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    actions.saveDynamicRole.mockResolvedValue({ ok: false, error: "Last administrator must remain active." });
    render(<RoleManagementModal isOpen onClose={() => {}} roles={[custom]} canManageAccess onSaved={saved} />);
    await screen.findByRole("checkbox", { name: "receiving.view — Warehouse-wide" });
    await user.type(screen.getByLabelText("Reason for change"), "Review access");
    await user.click(screen.getByRole("checkbox", { name: /I confirm these access changes/ }));
    await user.click(screen.getByRole("button", { name: "Save role" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Last administrator");
    expect(saved).not.toHaveBeenCalled();
  });
  it("reports catalog failure instead of presenting a usable empty editor", async () => {
    actions.listPermissionCatalog.mockResolvedValue({ ok: false, error: "Permission catalog unavailable." });
    render(<RoleManagementModal isOpen onClose={() => {}} roles={[custom]} canManageAccess />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission catalog unavailable");
    expect(screen.getByRole("button", { name: "Save role" })).toBeDisabled();
  });
  it("deactivates custom roles with an explicit reason and confirmation", async () => {
    const user = userEvent.setup();
    render(<RoleManagementModal isOpen onClose={() => {}} roles={[custom]} canManageAccess />);
    await user.type(screen.getByLabelText("Reason for change"), "Retiring old shift access");
    await user.click(screen.getByRole("checkbox", { name: /I confirm these access changes/ }));
    await user.click(screen.getByRole("button", { name: "Deactivate role" }));
    await waitFor(() => expect(actions.deleteDynamicRole).toHaveBeenCalledWith("role-custom", "Retiring old shift access"));
  });
});

it("contains keyboard focus and restores it after Escape closes the dialog", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  const { rerender } = render(<><button type="button">Open roles</button><RoleManagementModal isOpen={false} onClose={close} roles={[system]} /></>);
  const opener = screen.getByRole("button", { name: "Open roles" });
  opener.focus();
  rerender(<><button type="button">Open roles</button><RoleManagementModal isOpen onClose={close} roles={[system]} /></>);
  expect(screen.getByRole("dialog")).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: /Warehouse Staff/ })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Close access editor" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(close).toHaveBeenCalledOnce();
  rerender(<><button type="button">Open roles</button><RoleManagementModal isOpen={false} onClose={close} roles={[system]} /></>);
  expect(opener).toHaveFocus();
});
