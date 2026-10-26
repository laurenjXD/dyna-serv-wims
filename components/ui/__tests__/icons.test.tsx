// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Check } from "../icons";

describe("canonical icon entry point", () => {
  it("re-exports the approved Lucide icon set", () => {
    const { container } = render(<Check aria-label="Complete" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
