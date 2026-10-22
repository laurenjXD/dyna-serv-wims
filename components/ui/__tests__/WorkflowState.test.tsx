// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowState } from "../WorkflowState";

describe("WorkflowState", () => {
  it("renders a consistent empty state with a recovery action", () => {
    render(
      <WorkflowState
        kind="empty"
        title="No receiving work"
        description="There are no WRRs ready for receiving."
        actionLabel="Refresh"
        onAction={() => undefined}
      />,
    );

    expect(screen.getByText("No receiving work")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("renders unavailable states as accessible alerts with What/Why/Next Action copy", () => {
    render(
      <WorkflowState
        kind="unavailable"
        title="Inventory data unavailable"
        description="The inventory service did not respond. Retry the request."
        actionLabel="Retry"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Inventory data unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("Retry");
  });

  it("uses a status region for loading rather than an empty result", () => {
    render(<WorkflowState kind="loading" title="Loading inventory" description="Please wait." />);

    expect(screen.getByRole("status", { name: "Loading inventory" })).toBeInTheDocument();
  });
});
