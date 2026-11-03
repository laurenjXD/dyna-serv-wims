type PickListErrorMessage = {
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

// Use visible field labels and one concrete next step. Never render raw
// validator paths, database errors, or exception text in the workflow banner.
const messages: Record<string, string> = {
  customer_pn_invalid: "Customer PN must be 100 characters or fewer. Shorten it or leave it blank, then try again.",
  item_required: "Choose an item for every line, then try again.",
  location_required: "Choose a stock location for every item, then try again.",
  quantity_invalid: "Enter a whole number of boxes greater than zero for every item.",
  quantity_must_match_spq: "The quantity must make complete boxes. Enter a whole number in Qty (Boxes).",
  organization_required: "Select an Organization, then try again.",
  inventory_model_required: "Select an Inventory Model, then try again.",
  recipient_required: "Select a recipient, then try again.",
  no_pick_lines: "Add at least one item and enter the boxes to pick.",
  forbidden: "You do not have permission to create pick lists. Ask an administrator for access.",
  unauthenticated: "Your session has ended. Sign in again, then try again.",
  fifo_override_required: "This selection changes the recommended picking order. Use the recommended locations or request supervisor approval.",
  override_single_pallet_required: "Only one alternate location can be approved at a time. Request approval for each alternate location separately.",
  override_request_failed: "The approval request could not be sent. Try again.",
  invalid_override_request: "Select an alternate location and enter a reason before requesting approval.",
  invalid_approval: "This approval cannot be used. Request a new supervisor approval.",
  approval_unavailable: "This approval is no longer available. Request a new supervisor approval.",
  approval_consumed: "This approval has already been used. Request a new supervisor approval.",
  approval_stale: "The stock changed after approval. Review the locations and request approval again.",
  approval_mismatch: "The selection differs from the approved request. Use the approved selection or request a new approval.",
  approval_forbidden: "Another authorized supervisor must approve this selection.",
  provisional_item_code: "An item is missing its supplier or DSGC item code. Add the code in Item Master, then try again.",
  invalid_end_customer: "The End Customer is unavailable. Choose an active End Customer.",
  end_customer_inactive_or_not_found: "The End Customer is unavailable. Choose an active End Customer.",
  end_customer_relationship_required: "This Organization is not an End Customer. Choose an enrolled End Customer.",
  organization_inactive_or_not_found: "The Organization is unavailable. Choose an active Organization.",
  organization_relationship_required: "This Organization cannot use the selected Inventory Model. Choose a valid Organization and Inventory Model.",
  no_rate_configured: "This item has no Trading price. Ask an administrator to add a price in Billing & Pricing.",
  fx_rate_required: "The exchange rate is missing. Ask an administrator to add the current rate.",
  price_invalid: "The Trading price needs correction. Ask an administrator to update it in Billing & Pricing.",
  insufficient_stock: "There is not enough available stock. Refresh inventory and review the boxes and locations.",
  unable_to_reserve_stock: "The stock could not be reserved. Refresh inventory and try again.",
  stale_record: "The stock changed while you were working. Refresh inventory and review your selection.",
  concurrent_modification: "The stock changed while you were working. Refresh inventory and review your selection.",
  invalid_transition: "This pick list has already moved to another step. Refresh the page to see its current status.",
  duplicate_operation: "This request has already been completed. Check the Pick Lists queue before trying again.",
  invalid_request: "The pick-list details are incomplete. Review the items, boxes, and locations, then try again.",
  invalid_payload: "The pick-list details are incomplete. Review the items, boxes, and locations, then try again.",
  unexpected_error: "The request could not be completed. Try again. If it happens again, contact an administrator.",
};

function errorCode(error: string): string {
  if (Object.hasOwn(messages, error)) return error;
  // Compatibility with previously returned validation strings, including
  // repeated errors for split allocations of the same draft item.
  if (/customerItemCode/.test(error)) return "customer_pn_invalid";
  if (/endCustomerPartyId|customerPartyId/.test(error)) return "recipient_required";
  if (/partyId/.test(error)) return "organization_required";
  if (/flowType/.test(error)) return "inventory_model_required";
  if (/itemId/.test(error)) return "item_required";
  if (/lotId|locationId/.test(error)) return "location_required";
  if (/\bqty\b/.test(error) || error === "invalid_line_quantity") return "quantity_invalid";
  if (/lines must be a non-empty array/.test(error)) return "no_pick_lines";
  return "unexpected_error";
}

export function normalizePickListErrors(errors: string[]): string {
  return [...new Set(errors.map(errorCode))].join(",") || "unexpected_error";
}

export function getPickListErrorMessage(error: string | string[]): PickListErrorMessage {
  const codes = normalizePickListErrors(Array.isArray(error) ? error : error.split(",")).split(",");
  const description = [...new Set(codes.map((code) => messages[code]))].join(" ");
  if (codes.some((code) => ["insufficient_stock", "unable_to_reserve_stock", "stale_record", "concurrent_modification"].includes(code))) {
    return { description, actionLabel: "Refresh inventory", actionHref: "/inventory" };
  }
  return { description, actionLabel: "Review pick list", actionHref: "/inventory?tab=pick-lists#draft-generator" };
}
