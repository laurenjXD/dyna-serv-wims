// @vitest-environment jsdom

import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoSubmitSelect } from "../_components/AutoSubmitSelect";

describe("AutoSubmitSelect", () => {
  it("submits its containing server-query form as soon as the selection changes", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={handleSubmit}>
        <AutoSubmitSelect aria-label="Status" name="status" defaultValue="">
          <option value="">All</option>
          <option value="confirmed">Confirmed</option>
        </AutoSubmitSelect>
      </form>,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "confirmed");

    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });
});
