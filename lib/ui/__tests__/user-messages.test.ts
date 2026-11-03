import { describe, expect, it } from "vitest";
import { toUserMessage } from "../user-messages";

describe("user-facing message boundary", () => {
  it("keeps precise authored messages and user-visible record references", () => {
    const message = "Lot ABC_123 has 6 boxes available. Choose another location for the remaining boxes.";
    expect(toUserMessage(message)).toBe(message);
  });

  it("maps stable codes without exposing the implementation name", () => {
    expect(toUserMessage("insufficient_stock")).toBe("There is not enough available stock. Review the quantity and stock locations.");
    expect(toUserMessage("period_closed")).toBe("This billing period is closed. Choose an open billing period to make changes.");
  });

  it("deduplicates repeated validation messages and uses the visible field label", () => {
    expect(toUserMessage([
      "lines[0]: customerItemCode must be a string of 100 characters or fewer when provided",
      "lines[1]: customerItemCode must be a string of 100 characters or fewer when provided",
    ])).toBe("Customer PN must be 100 characters or fewer. Shorten it and try again.");
  });

  it("formats structured validation issues without displaying JSON paths", () => {
    const issues = [{ path: ["lines", 0, "customerItemCode"], message: "Expected string, received null" }];
    expect(toUserMessage(issues)).toBe("Enter a valid Customer PN before continuing.");
    expect(toUserMessage(JSON.stringify(issues))).toBe("Enter a valid Customer PN before continuing.");
  });

  it.each([
    "Failed query: select * from private_table",
    "Supabase returned a provider error with token=secret",
    "TypeError: Cannot read properties of undefined",
    "permission denied for table inventory_units",
    "UNRECOGNIZED_INTERNAL_ERROR",
    "unrecognized_internal_error",
    "P0001",
    "23503",
  ])("hides technical details (%s)", (value) => {
    expect(toUserMessage(value, "The file could not be loaded. Try again.")).toBe("The file could not be loaded. Try again.");
  });

  it("uses safe fallbacks for missing messages and unrecognized exceptions", () => {
    expect(toUserMessage(undefined, "Try again.")).toBe("Try again.");
    expect(toUserMessage(new Error("confidential details"), "Try again.")).toBe("Try again.");
  });

  it("translates known field-code families and quantity constraints", () => {
    expect(toUserMessage("amount_must_be_positive")).toBe("Enter Amount greater than zero.");
    expect(toUserMessage("expectedQty must be greater than 0")).toBe("Enter Expected Qty (Total Units) greater than zero.");
    expect(toUserMessage("unitCbm is required")).toBe("Enter Unit CBM (Per Carton) before continuing.");
  });

  it("deduplicates joined codes and keeps different recovery messages", () => {
    const result = toUserMessage("forbidden|forbidden|session_expired");
    expect(result).toBe("You do not have permission to do this. Ask an administrator for access. Your session has ended. Sign in again to continue.");
  });
});
