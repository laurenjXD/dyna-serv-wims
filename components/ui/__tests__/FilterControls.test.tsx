// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterDateInput, FilterSearchInput, FilterSelect } from "../index";

describe("filter controls", () => {
  it("renders a labeled reusable select and reports changes", () => {
    const onChange = vi.fn();
    render(
      <FilterSelect
        label="Organization"
        value="all"
        options={[{ value: "all", label: "All Organizations" }]}
        onChange={onChange}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Organization" });
    expect(select.closest("[data-ui='filter-select']")).toHaveClass("h-12", "rounded-xl");
    fireEvent.change(select, { target: { value: "all" } });
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("renders an accessible date input with the shared filter treatment", () => {
    render(<FilterDateInput label="From" name="from" />);
    const input = screen.getByLabelText("From");
    expect(input).toHaveAttribute("type", "date");
    expect(input.closest("[data-ui='filter-date-input']")).toHaveClass("h-12", "rounded-xl");
  });

  it("renders the canonical 48px search control", () => {
    render(<FilterSearchInput aria-label="Search documents" value="abc" onChange={() => {}} onClear={() => {}} />);
    const input = screen.getByRole("searchbox", { name: "Search documents" });
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveClass("h-12", "rounded-xl");
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });
});
