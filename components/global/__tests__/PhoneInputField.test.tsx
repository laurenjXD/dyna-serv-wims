// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInputField, COUNTRY_OPTIONS } from "../PhoneInputField";

describe("PhoneInputField", () => {
  it("renders with default country as Philippines (+63)", () => {
    render(<PhoneInputField name="phone" placeholder="917 123 4567" />);

    expect(screen.getByText("+63")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("917 123 4567")).toBeInTheDocument();
  });

  it("updates full phone value on number change", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<PhoneInputField onChange={handleChange} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "9171234567");

    expect(handleChange).toHaveBeenLastCalledWith("+63 9171234567");
  });

  it("switches country code and updates value prefix", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<PhoneInputField defaultValue="+63 917 123 4567" onChange={handleChange} />);

    const select = screen.getByRole("combobox", { name: /country calling code/i });
    await user.selectOptions(select, "US");

    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(handleChange).toHaveBeenLastCalledWith("+1 917 123 4567");
  });

  it("correctly parses initial phone string with international dial code", () => {
    render(<PhoneInputField value="+81 90 1234 5678" />);

    expect(screen.getByText("+81")).toBeInTheDocument();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("90 1234 5678");
  });

  it("renders hidden input with full combined phone value for form submission", async () => {
    const user = userEvent.setup();
    const { container } = render(<PhoneInputField name="contact_phone" defaultValue="+63 9171112233" />);

    const hiddenInput = container.querySelector('input[name="contact_phone"]') as HTMLInputElement;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput.value).toBe("+63 9171112233");

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "9189998877");

    expect(hiddenInput.value).toBe("+63 9189998877");
  });
});
