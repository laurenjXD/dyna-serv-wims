// Party input validation helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R1.1-R1.3, R1.6, R6.1
//   specs/06-party-and-item-enrollment/design.md §2 (canonical parties fields), §5

export type PartyInput = {
  code: string;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  address1?: string | null;
  address2?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isActive: boolean;
};

export type FieldError = { field: string; message: string };

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: FieldError[] };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes and validates raw party input.
 * On success returns a structured PartyInput.
 * On failure returns a FieldError array identifying each offending field.
 * isActive defaults to true when omitted.
 */
export function parsePartyInput(input: unknown): ParseResult<PartyInput> {
  const errors: FieldError[] = [];

  if (typeof input !== "object" || input === null) {
    return {
      success: false,
      errors: [{ field: "input", message: "Input must be a non-null object." }],
    };
  }

  const raw = input as Record<string, unknown>;

  // code — varchar(50) NOT NULL UNIQUE
  const code = raw["code"];
  if (code === undefined || code === null || code === "") {
    errors.push({ field: "code", message: "Party code is required." });
  } else if (typeof code !== "string") {
    errors.push({ field: "code", message: "Party code must be a string." });
  } else if (code.length > 50) {
    errors.push({
      field: "code",
      message: "Party code must not exceed 50 characters.",
    });
  }

  // name — varchar(255) NOT NULL
  const name = raw["name"];
  if (name === undefined || name === null || name === "") {
    errors.push({ field: "name", message: "Party name is required." });
  } else if (typeof name !== "string") {
    errors.push({ field: "name", message: "Party name must be a string." });
  } else if (name.length > 255) {
    errors.push({
      field: "name",
      message: "Party name must not exceed 255 characters.",
    });
  }

  // email — nullable; when provided must be a valid email format
  const email = raw["email"];
  if (email !== undefined && email !== null) {
    if (typeof email !== "string") {
      errors.push({ field: "email", message: "Email must be a string." });
    } else if (email !== "" && !EMAIL_REGEX.test(email)) {
      errors.push({
        field: "email",
        message: "Email must be a valid email address.",
      });
    }
  }

  // payment_terms — varchar(100), nullable
  const paymentTerms = raw["paymentTerms"];
  if (paymentTerms !== undefined && paymentTerms !== null) {
    if (typeof paymentTerms !== "string") {
      errors.push({ field: "paymentTerms", message: "Payment terms must be a string." });
    } else if (paymentTerms.length > 100) {
      errors.push({
        field: "paymentTerms",
        message: "Payment terms must not exceed 100 characters.",
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Build the validated output
  const data: PartyInput = {
    code: (code as string).trim(),
    name: (name as string).trim(),
    contactPerson:
      raw["contactPerson"] !== undefined
        ? (raw["contactPerson"] as string | null)
        : null,
    email:
      email !== undefined ? (email as string | null) : null,
    phone:
      raw["phone"] !== undefined ? (raw["phone"] as string | null) : null,
    taxId:
      raw["taxId"] !== undefined ? (raw["taxId"] as string | null) : null,
    address1:
      raw["address1"] !== undefined
        ? (raw["address1"] as string | null)
        : null,
    address2:
      raw["address2"] !== undefined
        ? (raw["address2"] as string | null)
        : null,
    paymentTerms:
      paymentTerms !== undefined ? (paymentTerms as string | null) : null,
    notes:
      raw["notes"] !== undefined ? (raw["notes"] as string | null) : null,
    isActive:
      typeof raw["isActive"] === "boolean" ? raw["isActive"] : true,
  };

  return { success: true, data };
}
