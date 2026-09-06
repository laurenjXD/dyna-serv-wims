// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Heading, Text, Label, Code, DataDisplay } from "../Typography";

describe("Typography components suite", () => {
  it("renders Heading as semantic h1-h6 tags", () => {
    const { container } = render(
      <>
        <Heading as="h1">Hero Heading 1</Heading>
        <Heading as="h2">Section Heading 2</Heading>
        <Heading as="h3">Card Heading 3</Heading>
        <Heading as="h4">Group Heading 4</Heading>
        <Heading as="h5">Tile Heading 5</Heading>
        <Heading as="h6">Micro Heading 6</Heading>
      </>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hero Heading 1");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Section Heading 2");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Card Heading 3");
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("Group Heading 4");
    expect(screen.getByRole("heading", { level: 5 })).toHaveTextContent("Tile Heading 5");
    expect(screen.getByRole("heading", { level: 6 })).toHaveTextContent("Micro Heading 6");
    expect(container.querySelector("h1")).toHaveClass("text-headline-xl");
  });

  it("renders Text with sizes and semantic variants", () => {
    render(
      <>
        <Text size="lg" variant="primary">
          Lead Text
        </Text>
        <Text size="md" variant="secondary">
          Standard Body
        </Text>
        <Text size="sm" variant="error">
          Small Error
        </Text>
      </>
    );

    expect(screen.getByText("Lead Text")).toHaveClass("text-body-lg");
    expect(screen.getByText("Standard Body")).toHaveClass("text-body-md");
    expect(screen.getByText("Small Error")).toHaveClass("text-error");
  });

  it("enforces floor minimum 16px rule for small text", () => {
    render(
      <Text size="sm" surface="floor">
        Floor Text
      </Text>
    );
    // On floor screens, sm (14px) must be promoted to md (16px)
    expect(screen.getByText("Floor Text")).toHaveClass("text-body-md");
  });

  it("renders Label with required indicator", () => {
    render(<Label required>Item Barcode</Label>);
    const label = screen.getByText(/item barcode/i);
    expect(label).toBeInTheDocument();
    expect(screen.getByText("*")).toHaveClass("text-error");
  });

  it("renders Code with mono font and border styling", () => {
    render(<Code>LOC-A-01</Code>);
    expect(screen.getByText("LOC-A-01")).toHaveClass("font-mono");
  });

  it("renders DataDisplay with KPI value and unit", () => {
    render(<DataDisplay label="Available Stock" value="1,250" unit="Units" size="lg" />);
    expect(screen.getByText("Available Stock")).toBeInTheDocument();
    expect(screen.getByText("1,250")).toBeInTheDocument();
    expect(screen.getByText("Units")).toBeInTheDocument();
  });
});
