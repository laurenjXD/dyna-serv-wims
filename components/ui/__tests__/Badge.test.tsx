// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../Badge";
import { StatusBadge, InventoryModelBadge, RoleBadge } from "../StatusBadge";

describe("Badge and StatusBadge components", () => {
  it("renders basic Badge with dot", () => {
    const { container } = render(
      <Badge variant="success" dot>
        Active
      </Badge>
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(container.querySelector(".rounded-full.bg-emerald-500")).toBeInTheDocument();
  });

  it("renders StatusBadge with correct semantic status mapping", () => {
    render(<StatusBadge status="available" />);
    expect(screen.getByText("available")).toBeInTheDocument();

    render(<StatusBadge status="held" label="On Hold" />);
    expect(screen.getByText("On Hold")).toBeInTheDocument();
  });

  it("renders InventoryModelBadge for VMI, Trading, and Customer-Owned", () => {
    render(<InventoryModelBadge model="vmi" />);
    expect(screen.getByText("VMI")).toBeInTheDocument();

    render(<InventoryModelBadge model="trading" />);
    expect(screen.getByText("Trading")).toBeInTheDocument();

    render(<InventoryModelBadge model="customer_owned" />);
    expect(screen.getByText("Customer-Owned")).toBeInTheDocument();
  });

  it("renders RoleBadge for system roles", () => {
    render(<RoleBadge role="administrator" />);
    expect(screen.getByText("Administrator")).toBeInTheDocument();

    render(<RoleBadge role="supervisor" />);
    expect(screen.getByText("Supervisor")).toBeInTheDocument();

    render(<RoleBadge role="warehouse_staff" />);
    expect(screen.getByText("Warehouse Staff")).toBeInTheDocument();
  });
});
