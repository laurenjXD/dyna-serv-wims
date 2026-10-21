// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiItemPickListDraft } from "../MultiItemPickListDraft";

vi.mock("../../_actions", () => ({
  parseDraDocumentAction: vi.fn(),
}));

const stock = [{
  itemId: "item-1",
  itemCode: "ITEM-1",
  itemName: "Test item",
  customerItemCode: null,
  organizationId: "party-vmi-owner",
  organizationName: "VMI Owner Organization",
  flowType: "vmi" as const,
  uom: "piece",
  spq: 1,
  balanceId: "balance-1",
  lotId: "lot-1",
  lotNumber: "LOT-1",
  locationId: "location-1",
  locationLabel: "A4-01",
  availableQty: 10,
  priority: 1,
}];

describe("MultiItemPickListDraft organization selection", () => {
  it("renders the organization linked to available stock and its inventory model", () => {
    render(
      <MultiItemPickListDraft
        stock={stock}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    const organizationSelect = screen.getByLabelText("Organization");
    expect(screen.getByRole("option", { name: "VMI Owner Organization" })).toBeInTheDocument();

    fireEvent.change(organizationSelect, { target: { value: "party-vmi-owner" } });

    expect(screen.getByRole("option", { name: "VMI (Consignment)" })).toBeInTheDocument();
  });
});
