import { describe, expect, it } from "vitest";
import { getPickListErrorMessage, normalizePickListErrors } from "../error-messages";

describe("pick-list error messages", () => {
  it("turns repeated split-line validation errors into one field-specific message", () => {
    const errors = [0, 1, 2, 3].map((index) => `lines[${index}]: customerItemCode must be a string of 100 characters or fewer when provided`);
    expect(normalizePickListErrors(errors)).toBe("customer_pn_invalid");
    const message = getPickListErrorMessage(errors.join(","));
    expect(message.description).toBe("Customer PN must be 100 characters or fewer. Shorten it or leave it blank, then try again.");
    expect(message.actionLabel).toBe("Review pick list");
    expect(message.description).not.toMatch(/lines\[|customerItemCode|Organization/);
  });

  it("never displays unknown exception or query-string content", () => {
    const message = getPickListErrorMessage("Database error: private_table unexpected_value <script>");
    expect(message.description).toBe("The request could not be completed. Try again. If it happens again, contact an administrator.");
    expect(message.description).not.toMatch(/private_table|unexpected_value|script/);
  });

  it("offers an inventory refresh for stock conflicts", () => {
    expect(getPickListErrorMessage("insufficient_stock")).toMatchObject({
      description: "There is not enough available stock. Refresh inventory and review the boxes and locations.",
      actionLabel: "Refresh inventory",
      actionHref: "/inventory",
    });
  });

  it("keeps different field errors while removing repeated messages", () => {
    const codes = normalizePickListErrors(["lines[0]: itemId is required", "lines[1]: itemId is required", "lines[1]: qty must be a finite positive whole number"]);
    expect(codes).toBe("item_required,quantity_invalid");
    expect(getPickListErrorMessage(codes).description).toBe("Choose an item for every line, then try again. Enter a whole number of boxes greater than zero for every item.");
  });
});
