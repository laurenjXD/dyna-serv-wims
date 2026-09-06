// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "../Input";

describe("Input component", () => {
  it("renders with label and helper text", () => {
    render(
      <Input
        label="Location Code"
        helperText="Scan or enter code"
        placeholder="LOC-A-01"
      />
    );

    expect(screen.getByLabelText(/location code/i)).toBeInTheDocument();
    expect(screen.getByText(/scan or enter code/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("LOC-A-01")).toBeInTheDocument();
  });

  it("renders error state with role='alert' and aria-invalid", () => {
    render(<Input label="Quantity" error="Invalid quantity entered" />);

    const input = screen.getByLabelText(/quantity/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid quantity entered");
  });

  it("handles clear button action", () => {
    const handleClear = vi.fn();
    render(
      <Input
        label="Search Bin"
        value="BIN-100"
        clearable
        onClear={handleClear}
        onChange={() => {}}
      />
    );

    const clearBtn = screen.getByLabelText(/clear input/i);
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });
});
