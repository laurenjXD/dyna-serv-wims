// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PickListRow } from "@/lib/db/queries/withdrawals";
import { PickQueueSection } from "../_components/PickQueueSection";

const allocatedRow: PickListRow = {
  id: "pick-allocated",
  pickListNumber: "PL-ALLOCATED-001",
  status: "allocated",
  customerPartyId: "organization-1",
  customerPartyName: "Summit Industrial Supply",
  flowType: "supplies",
  createdAt: new Date("2026-08-23T08:00:00Z"),
};

const pickedRow: PickListRow = {
  ...allocatedRow,
  id: "pick-ready",
  pickListNumber: "PL-PICKED-001",
  status: "picked",
};

describe("PickQueueSection", () => {
  it("keeps allocated work in a dedicated To Pick queue", () => {
    render(<PickQueueSection mode="pick" rows={[allocatedRow]} canExecute />);

    expect(screen.getByRole("heading", { name: "To Pick" })).toBeInTheDocument();
    expect(screen.getByText("1 waiting")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start pick/i })).toHaveAttribute(
      "href",
      "/pick-lists/pick-allocated/pick",
    );
    expect(screen.queryByRole("link", { name: /^dispatch/i })).not.toBeInTheDocument();
  });

  it("keeps picked work in a dedicated To Dispatch queue", () => {
    render(<PickQueueSection mode="dispatch" rows={[pickedRow]} canExecute />);

    expect(screen.getByRole("heading", { name: "To Dispatch" })).toBeInTheDocument();
    expect(screen.getByText("1 ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^dispatch/i })).toHaveAttribute(
      "href",
      "/pick-lists/pick-ready/dispatch",
    );
    expect(screen.queryByRole("link", { name: /start pick/i })).not.toBeInTheDocument();
  });

  it("shows a phase-specific empty state without hiding the other queue", () => {
    render(<PickQueueSection mode="dispatch" rows={[]} canExecute />);

    expect(screen.getByText("0 ready")).toBeInTheDocument();
    expect(
      screen.getByText("Completed picks will appear here when they are ready for dispatch."),
    ).toBeInTheDocument();
  });
});
