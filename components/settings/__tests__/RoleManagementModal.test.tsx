// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleManagementModal } from "../RoleManagementModal";
import type { DynamicRole } from "@/app/(authenticated)/settings/team/actions";

const role: DynamicRole = {
  id: "role-staff",
  key: "warehouse_staff",
  name: "Warehouse Staff",
  description: "Floor and operational work.",
  color: "bg-emerald-100 text-emerald-800 border-emerald-200",
  isSystem: true,
  capabilities: [
    {
      module: "Receiving (WRR)",
      view: true,
      create: true,
      edit: true,
      approve: false,
      delete: false,
    },
  ],
};

describe("RoleManagementModal", () => {
  it("shows the approved role reference without offering unsupported custom-role writes", () => {
    render(
      <RoleManagementModal
        isOpen
        onClose={() => {}}
        roles={[role]}
      />,
    );

    expect(screen.getByText("Approved capability reference")).toBeInTheDocument();
    expect(screen.getByText(/Capability grants are managed by the approved RBAC migrations/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add Role/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save Role Matrix/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").every((checkbox) => (checkbox as HTMLInputElement).disabled)).toBe(true);
  });
});
