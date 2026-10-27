// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WRRUnitLabelGenerator } from "@/components/barcode/WRRUnitLabelGenerator";

vi.mock("react-qr-code", () => ({
  default: ({ value }: { value: string }) => <svg data-testid="carton-qr" data-value={value} />,
}));

describe("WRRUnitLabelGenerator carton quantity contract", () => {
  it("generates one QR per carton while displaying the SPQ-derived total units", async () => {
    const user = userEvent.setup();

    render(
      <WRRUnitLabelGenerator
        wrrItemId="12345678-1234-4abc-8def-1234567890ab"
        wrrNumber="WRR-20261027-714370"
        itemCode="ITEM-001"
        lotNumber="LOT-456"
        cartonCount={100}
        spq={8}
        uom="piece"
      />,
    );

    expect(screen.getByRole("button", { name: "Print Carton Labels (100)" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Print Carton Labels (100)" }));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("100 cartons × SPQ 8 = 800 piece. One unique QR is generated per carton.")).toBeDefined();
    expect(screen.getAllByTestId("carton-qr")).toHaveLength(100);
  });
});
