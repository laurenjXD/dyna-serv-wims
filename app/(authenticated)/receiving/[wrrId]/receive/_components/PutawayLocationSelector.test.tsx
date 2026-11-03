// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PutawayLocationSelector } from "./PutawayLocationSelector";

afterEach(() => cleanup());

describe("PutawayLocationSelector whole-line receiving", () => {
  it("assigns the entire declared store line after one confirmation scan", () => {
    const { container } = render(
      <PutawayLocationSelector
        candidates={[
          {
            id: "loc-1",
            label: "B2-05",
            locationType: "storage",
            maxCbmCapacity: 100,
            occupiedCbm: 0,
            remainingCbm: 100,
          },
        ]}
        contents={{}}
        quantity={3}
        scannedQuantity={1}
        unitCbm={1}
        spq={30}
        uom="PCS"
      />,
    );

    expect(screen.getByText(/One valid QR scan identified this line/)).toBeInTheDocument();
    expect(screen.getByLabelText("Put all 3 declared boxes in")).toBeInTheDocument();
    expect(screen.queryByText(/How many boxes are physically present/)).not.toBeInTheDocument();

    const unitLocationIds = container.querySelector<HTMLInputElement>(
      'input[name="unitLocationIds"]',
    );
    const allocations = container.querySelector<HTMLInputElement>(
      'input[name="allocations"]',
    );

    expect(JSON.parse(unitLocationIds?.value ?? "null")).toEqual(["", "", ""]);
    expect(JSON.parse(allocations?.value ?? "null")).toEqual([]);

    fireEvent.focus(screen.getByLabelText("Put all 3 declared boxes in"));
    fireEvent.click(screen.getByRole("button", { name: /B2-05 \(Storage\)/ }));

    expect(screen.getByText(/3 of 3 declared boxes/)).toBeInTheDocument();
    expect(JSON.parse(unitLocationIds?.value ?? "null")).toEqual(["loc-1", "loc-1", "loc-1"]);
    expect(JSON.parse(allocations?.value ?? "null")).toEqual([
      { locationId: "loc-1", qty: 3 },
    ]);
  });

  it("does not reduce a large line to the single confirmation QR", () => {
    const { container } = render(
      <PutawayLocationSelector
        candidates={[
          {
            id: "loc-1",
            label: "B2-05",
            locationType: "storage",
            maxCbmCapacity: 1000,
            occupiedCbm: 0,
            remainingCbm: 1000,
          },
          {
            id: "loc-2",
            label: "B2-06",
            locationType: "storage",
            maxCbmCapacity: 1000,
            occupiedCbm: 0,
            remainingCbm: 1000,
          },
        ]}
        contents={{}}
        quantity={800}
        scannedQuantity={1}
        unitCbm={1}
      />,
    );

    fireEvent.focus(screen.getByLabelText("Put all 800 declared boxes in"));
    fireEvent.click(screen.getByRole("button", { name: /B2-06 \(Storage\)/ }));

    const unitLocationIds = container.querySelector<HTMLInputElement>(
      'input[name="unitLocationIds"]',
    );
    expect(JSON.parse(unitLocationIds?.value ?? "null").filter(Boolean)).toHaveLength(800);
    expect(screen.getByText(/800\/800 Boxes Assigned/)).toBeInTheDocument();
    expect(screen.queryByText("Put the 1 scanned box in")).not.toBeInTheDocument();
  });
});
