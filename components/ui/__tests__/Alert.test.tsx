// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Alert } from "../Alert";

describe("Alert component (3-component rule)", () => {
  it("renders 1. Title (What happened) and 2. Description (Why it failed)", () => {
    render(
      <Alert
        variant="error"
        title="Invalid Item Scanned"
        description="Barcode does not match active line item."
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Invalid Item Scanned")).toBeInTheDocument();
    expect(screen.getByText("Barcode does not match active line item.")).toBeInTheDocument();
  });

  it("renders 3. Action Label (Next Action/Recovery) and triggers callback", () => {
    const handleAction = vi.fn();
    render(
      <Alert
        variant="warning"
        title="FIFO Mismatch"
        description="Older lot exists."
        actionLabel="Request Override"
        onAction={handleAction}
      />
    );

    const actionBtn = screen.getByRole("button", { name: /request override/i });
    expect(actionBtn).toBeInTheDocument();
    fireEvent.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it("handles dismiss button action", () => {
    const handleDismiss = vi.fn();
    render(
      <Alert
        variant="info"
        title="Notice"
        description="System sync at 23:00"
        onDismiss={handleDismiss}
      />
    );

    const dismissBtn = screen.getByLabelText(/dismiss alert/i);
    expect(dismissBtn).toBeInTheDocument();
    fireEvent.click(dismissBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});
