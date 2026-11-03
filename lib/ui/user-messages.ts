/** Plain-language display boundary; internal error codes remain unchanged. */
const messages: Record<string, string> = {
  forbidden: "You do not have permission to do this. Ask an administrator for access.",
  unauthorized: "Sign in again to continue.",
  unauthenticated: "Your session has ended. Sign in again to continue.",
  permission_denied: "You do not have permission to do this. Ask an administrator for access.",
  not_found: "This record is unavailable. Return to the list and choose another record.",
  invalid_request: "Some details are missing or invalid. Review the form and try again.",
  invalid_payload: "Some details are missing or invalid. Review the form and try again.",
  validation_failed: "Some details need correction. Review the form and try again.",
  stale_record: "This record changed while you were working. Refresh the page and review the latest details.",
  concurrent_modification: "This record changed while you were working. Refresh the page and review the latest details.",
  version_conflict: "This record changed while you were working. Refresh the page and review the latest details.",
  invalid_transition: "This action is no longer available at the current step. Refresh the page to see the current status.",
  invalid_status: "This action is unavailable at the current step. Refresh the page to see the current status.",
  duplicate_operation: "This request has already been completed. Check the current record before trying again.",
  duplicate_request: "This request has already been submitted. Check its status before trying again.",
  insufficient_stock: "There is not enough available stock. Review the quantity and stock locations.",
  unable_to_reserve_stock: "The stock could not be reserved. Refresh inventory and review the available quantity.",
  quantity_must_match_spq: "The quantity must make complete boxes. Enter a whole number in Qty (Boxes).",
  fifo_override_required: "This selection changes the recommended picking order. Use the recommended locations or request supervisor approval.",
  approval_required: "Supervisor approval is required. Submit an approval request before continuing.",
  approval_pending: "This request is waiting for approval. Check its status before continuing.",
  approval_expired: "This approval has expired. Request a new approval.",
  approval_stale: "The details changed after approval. Review them and request approval again.",
  approval_consumed: "This approval has already been used. Request a new approval.",
  approval_mismatch: "The details differ from the approved request. Use the approved details or request a new approval.",
  approval_forbidden: "Another authorized supervisor must approve this request.",
  approval_unavailable: "This approval is no longer available. Request a new approval.",
  self_approval_not_allowed: "Another authorized supervisor must approve this request.",
  invalid_approval: "This approval cannot be used. Request a new approval.",
  invalid_end_customer: "The End Customer is unavailable. Choose an active End Customer.",
  end_customer_inactive_or_not_found: "The End Customer is unavailable. Choose an active End Customer.",
  end_customer_relationship_required: "Choose an Organization enrolled as an End Customer.",
  organization_inactive_or_not_found: "The Organization is unavailable. Choose an active Organization.",
  organization_relationship_required: "This Organization cannot use the selected Inventory Model. Choose a valid Organization and Inventory Model.",
  provisional_item_code: "An item is missing its supplier or DSGC item code. Add the code in Item Master before continuing.",
  no_rate_configured: "The Trading price is missing. Ask an administrator to add a price in Billing & Pricing.",
  fx_rate_required: "The exchange rate is missing. Ask an administrator to add the current rate.",
  price_invalid: "The Trading price needs correction. Ask an administrator to update it in Billing & Pricing.",
  policy_already_exists: "An active Trading rate card already exists. Edit the existing rate card instead.",
  contract_terms_already_exist: "An active VMI contract already exists. Edit the existing contract instead.",
  period_closed: "This billing period is closed. Choose an open billing period to make changes.",
  invalid_acknowledgement_receipt: "Choose a Delivery Receipt / Acknowledgement Receipt for the selected Organization.",
  documentation_rate_not_found: "The documentation rate is missing. Add it to the VMI contract terms before continuing.",
  no_pick_lines: "Add at least one item and enter the boxes to pick.",
  line_not_found: "This item line is unavailable. Refresh the page and choose another line.",
  invalid_line_quantity: "Enter a whole number of boxes greater than zero.",
  wrong_item_or_lot_qr: "This QR does not match the item or lot. Check the label and scan the correct QR.",
  invalid_qr: "This QR could not be read. Check the label and scan it again.",
  box_already_selected: "This box has already been verified. Scan the next unfinished line.",
  line_complete: "This line has already been verified. Scan the next unfinished line.",
  scan_evidence_incomplete: "Some lines still need verification. Scan each unfinished line before confirming dispatch.",
  pick_not_completed: "Picking is not complete. Mark the pick list as picked before dispatching it.",
  already_dispatched: "This pick list has already been dispatched. Return to the dispatch list.",
  commitment_expired: "The stock reservation has expired. Create a new pick list using the available stock.",
  commitment_not_active: "The stock reservation is no longer active. Review the pick list before continuing.",
  commitment_not_found: "The stock reservation is unavailable. Refresh the pick list and try again.",
  dispatch_stock_conflict: "The stock changed before dispatch could finish. Refresh the pick list and ask a supervisor to review it.",
  missing_location: "Choose a stock location before continuing.",
  presence_attestation_required: "Confirm the boxes are physically present before continuing.",
  allocation_qty_invalid: "Enter a whole number of boxes for each location.",
  allocation_qty_must_equal_derived_carton_count: "The location quantities do not match the boxes received. Review the split before confirming.",
  allocation_qty_must_equal_expected: "The location quantities do not match the expected quantity. Review the split before confirming.",
  network_restricted: "This action is unavailable on this connection. Connect to the approved warehouse network and try again.",
  offline: "You are offline. Reconnect before completing this action.",
  server_unavailable: "The service is temporarily unavailable. Try again shortly.",
  no_results: "No results match your search. Change the search or filters.",
  no_records: "There are no records to show yet.",
  invalid_credentials: "The email or password is incorrect. Check both and try again.",
  invalid_login_credentials: "The email or password is incorrect. Check both and try again.",
  email_not_confirmed: "Your email has not been confirmed. Open the confirmation link in your email, then sign in.",
  rate_limit_exceeded: "Too many requests were sent. Wait a moment and try again.",
  over_request_rate_limit: "Too many requests were sent. Wait a moment and try again.",
  otp_expired: "This verification code has expired. Request a new code and try again.",
  session_expired: "Your session has ended. Sign in again to continue.",
};

const fieldLabels: Record<string, string> = {
  customerItemCode: "Customer PN", customer_item_code: "Customer PN",
  supplierItemCode: "Supplier Item Code", supplier_item_code: "Supplier Item Code",
  itemCode: "Item Code", item_code: "Item Code", itemId: "Item", item_id: "Item",
  lotId: "Lot", lot_id: "Lot", lotNumber: "Lot Number", lot_number: "Lot Number",
  locationId: "Location", location_id: "Location", putawayLocationId: "Location",
  fromLocationId: "From Location", toLocationId: "To Location",
  vendorPartyId: "Organization", partyId: "Organization", party_id: "Organization",
  organizationId: "Organization", organization_id: "Organization",
  customerPartyId: "Customer", customer_party_id: "Customer",
  endCustomerPartyId: "End Customer", end_customer_party_id: "End Customer",
  flowType: "Inventory Model", flow_type: "Inventory Model",
  expectedQty: "Expected Qty (Total Units)", expected_qty: "Expected Qty (Total Units)", qty: "Quantity", quantity: "Quantity",
  numberOfBoxes: "Qty (Boxes)", packageCount: "Qty (Boxes)", boxes: "Qty (Boxes)", spq: "SPQ",
  uom: "UOM", unitCbm: "Unit CBM (Per Carton)", unit_cbm: "Unit CBM (Per Carton)", disposition: "Disposition",
  manufactureDate: "Manufacturing Date", manufacture_date: "Manufacturing Date",
  expiryDate: "Expiry Date", expiry_date: "Expiry Date",
  commercialInvoiceNo: "Commercial Invoice No.", commercial_invoice_no: "Commercial Invoice No.",
  buy_cost: "Buy Cost", buyCost: "Buy Cost", margin_value: "Margin", marginValue: "Margin",
  sell_price: "Selling Price", sell_price_override: "Selling Price", sellPrice: "Selling Price",
  fx_source: "Exchange Rate Source", fx_rate: "Exchange Rate", exchangeRate: "Exchange Rate",
  cbm_threshold: "CBM Threshold", over_threshold_rate: "Over-threshold Rate",
  storage_rate_per_cbm_day: "Daily Storage Rate", handling_in_rate_per_cbm: "Handling In Rate",
  handling_out_rate_per_cbm: "Handling Out Rate", documentation_default_rate_usd: "Documentation Rate",
  monthly_fee_usd: "Monthly Fee", item_scope: "Item Scope", valid_from: "Start Date", valid_to: "End Date",
  permit_number: "Permit Number", charge_date: "Charge Date", amount: "Amount", notes: "Notes",
  email: "Email", password: "Password", phone: "Phone Number", displayName: "Name", name: "Name",
  reason: "Reason", code: "Code", description: "Description", address: "Address",
};

const defaultMessage = "This action could not be completed. Try again. If it happens again, contact an administrator.";
const technicalDetails = /(?:SQLSTATE|PGRST\d*|postgres(?:ql)?|postgrest|drizzle|supabase|stack\s*trace|failed query|invalid input syntax|violates? .*constraint|duplicate key|foreign key|row.level security|permission denied for|relation .+does not exist|column .+does not exist|TypeError:|ReferenceError:|SyntaxError:|Unexpected token|ECONN\w*|ENOTFOUND|ENOENT|fetch failed|failed to fetch|NetworkError|AbortError|Load failed|\bat \S+ \([^)]*:\d+:\d+\)|\b(?:undefined|NaN)\b|https?:\/\/\S+\?(?:[^\s]*token|[^\s]*key))/i;

function fieldMessage(text: string): string | null {
  const field = Object.keys(fieldLabels).find((key) => new RegExp(`(?:^|[\\s.\\[\\]"':/])${key}(?=$|[\\s.\\[\\]"':/])`).test(text));
  if (!field) return null;
  const label = fieldLabels[field];
  const limit = text.match(/(?:at most|max(?:imum)?|no more than)\s*(\d+)|\b(\d+)\s*characters?\s*(?:or fewer|or less|maximum|max)/i);
  if (limit) return `${label} must be ${limit[1] ?? limit[2]} characters or fewer. Shorten it and try again.`;
  if (/required|non-empty|missing|must not be empty|cannot be empty/i.test(text)) return `Enter ${label} before continuing.`;
  if (/one of|enum|choose|select/i.test(text)) return `Choose a valid ${label} before continuing.`;
  if (/positive|greater than (?:zero|0)|>\s*0/i.test(text)) return `Enter ${label} greater than zero.`;
  if (/whole|integer/i.test(text)) return `Enter a whole number for ${label}.`;
  if (/must be|invalid|expected|received|not valid/i.test(text)) return `Enter a valid ${label} before continuing.`;
  return null;
}

/** Accepts authored text, stable codes, or validator arrays; never logs data. */
export function toUserMessage(value: unknown, fallback = defaultMessage): string {
  if (Array.isArray(value)) {
    const unique = [...new Set(value.map((entry) => toUserMessage(entry, fallback)))];
    return unique.length ? unique.join(" ") : fallback;
  }
  if (value instanceof Error) return messages[value.message] ?? fallback;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    const path = "path" in value && Array.isArray(value.path) ? value.path.join(".") : "";
    return toUserMessage(path ? `${path}: ${value.message}` : value.message, fallback);
  }
  if (typeof value !== "string" || !value.trim()) return fallback;
  const text = value.trim();
  const code = text.replace(/^Error:\s*/i, "").toLowerCase();
  if (Object.hasOwn(messages, code)) return messages[code];
  if (technicalDetails.test(text)) return fallback;
  for (const [key, label] of Object.entries(fieldLabels)) {
    const prefix = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (code === `${prefix}_required` || code === `missing_${prefix}`) return `Enter ${label} before continuing.`;
    if (code === `${prefix}_invalid` || code === `invalid_${prefix}`) return `Enter a valid ${label} before continuing.`;
    if (code === `${prefix}_must_be_positive`) return `Enter ${label} greater than zero.`;
  }
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const data: unknown = JSON.parse(text);
      const issues = Array.isArray(data) ? data : (data && typeof data === "object" && "issues" in data ? data.issues : null);
      if (Array.isArray(issues)) return toUserMessage(issues.map((issue) => {
        if (!issue || typeof issue !== "object" || typeof issue.message !== "string") return fallback;
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        return `${path}: ${issue.message}`;
      }), fallback);
    } catch { /* Unknown structured details use the safe fallback below. */ }
    return fallback;
  }
  if (text.includes("|") || /^(?:[a-z]+_)+[a-z]+(?:\s*,\s*(?:[a-z]+_)+[a-z]+)+$/.test(text)) {
    return toUserMessage(text.split(/[|,]/).filter((entry) => entry.trim()), fallback);
  }
  const validation = /(?:lines?\[\d+\]|\b(?:must be|non-empty|expected|received|is required|is invalid)\b)/i.test(text);
  if (validation) {
    const field = fieldMessage(text);
    if (field) return field;
    if (/non-null object|non-empty array|expected .*received/i.test(text)) return "Some details are missing or invalid. Review the form and try again.";
  }
  // Unrecognized internal codes and validator paths must not be humanized by
  // replacing underscores: that exposes implementation names without recovery.
  if (/\b[a-z]+(?:_[a-z]+)+\b|\blines?\[\d+\]|\b\w+\.\w+:/.test(text) || /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^(?:\d{5}|[A-Z]\d{4})$/.test(text)) return fallback;
  return text;
}
