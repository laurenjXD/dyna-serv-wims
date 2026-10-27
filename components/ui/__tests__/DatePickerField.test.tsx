// @vitest-environment jsdom

import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePickerField } from "@/components/ui/DatePickerField";

function Harness({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <DatePickerField
      id="manufacture-date"
      name="manufactureDate"
      value={value}
      onChange={setValue}
    />
  );
}

describe("DatePickerField", () => {
  it("allows direct month and year selection before choosing a day", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /select date/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Month" }), "9");
    await user.selectOptions(screen.getByRole("combobox", { name: "Year" }), "2021");
    await user.click(screen.getByRole("gridcell", { name: "27" }));

    expect(screen.getByRole("button", { name: /10\/27\/2021/i })).toBeDefined();
    expect(screen.getByDisplayValue("2021-10-27")).toBeDefined();
  });

  it("opens on the existing date and marks it selected", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue="2021-10-27" />);

    await user.click(screen.getByRole("button", { name: /10\/27\/2021/i }));

    expect(screen.getByRole("combobox", { name: "Month" })).toHaveValue("9");
    expect(screen.getByRole("combobox", { name: "Year" })).toHaveValue("2021");
    expect(screen.getByRole("gridcell", { name: "27" })).toHaveAttribute("aria-selected", "true");
  });
});
