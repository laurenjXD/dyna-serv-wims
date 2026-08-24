// lib/withdrawal/withdrawal-validator.ts
//
// Pure business-logic validation for withdrawal request input.
// No zod — manual validation only (zod is not installed).
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md R1.1, R1.2, R2.5, R5.1
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §6

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidatedWithdrawalLine = {
  itemId: string;
  lotId: string;
  locationId: string;
  qty: number;
  itemCodeIsProvisional?: boolean;
};

export type ValidatedWithdrawal = {
  partyId: string;
  flowType: "vmi" | "trading" | "supplies";
  lines: ValidatedWithdrawalLine[];
  idempotencyKey?: string;
  approvalRequestId?: string;
  enforceSourceSelection?: boolean;
};

export type WithdrawalValidationResult =
  | { ok: true; data: ValidatedWithdrawal }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// validateWithdrawal
// ---------------------------------------------------------------------------

const VALID_FLOW_TYPES = new Set(["vmi", "trading", "supplies"]);

export function validateWithdrawal(input: unknown): WithdrawalValidationResult {
  const errors: string[] = [];

  // Top-level object check
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Input must be a non-null object"],
    };
  }

  const raw = input as Record<string, unknown>;

  // Validate partyId
  if (typeof raw["partyId"] !== "string" || raw["partyId"].trim() === "") {
    errors.push("partyId is required and must be a non-empty string");
  }

  // Validate flowType
  const flowType = raw["flowType"];
  if (typeof flowType !== "string" || !VALID_FLOW_TYPES.has(flowType)) {
    errors.push("flowType must be one of: vmi, trading, supplies");
  }

  // Validate idempotencyKey (optional)
  if (
    raw["idempotencyKey"] !== undefined &&
    typeof raw["idempotencyKey"] !== "string"
  ) {
    errors.push("idempotencyKey must be a string when provided");
  }

  if (
    raw["approvalRequestId"] !== undefined &&
    (typeof raw["approvalRequestId"] !== "string" || raw["approvalRequestId"].trim() === "")
  ) {
    errors.push("approvalRequestId must be a non-empty string when provided");
  }

  if (
    raw["enforceSourceSelection"] !== undefined &&
    typeof raw["enforceSourceSelection"] !== "boolean"
  ) {
    errors.push("enforceSourceSelection must be a boolean when provided");
  }

  // Validate lines
  const rawLines = raw["lines"];
  const validatedLines: ValidatedWithdrawalLine[] = [];

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    errors.push("lines must be a non-empty array");
  } else {
    for (let i = 0; i < rawLines.length; i++) {
      const lineResult = validateLine(rawLines[i], i);
      errors.push(...lineResult.errors);
      if (lineResult.line !== null) {
        validatedLines.push(lineResult.line);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const data: ValidatedWithdrawal = {
    partyId: (raw["partyId"] as string).trim(),
    flowType: flowType as "vmi" | "trading" | "supplies",
    lines: validatedLines,
  };

  if (typeof raw["idempotencyKey"] === "string") {
    data.idempotencyKey = raw["idempotencyKey"];
  }
  if (typeof raw["approvalRequestId"] === "string") {
    data.approvalRequestId = raw["approvalRequestId"].trim();
  }
  if (typeof raw["enforceSourceSelection"] === "boolean") {
    data.enforceSourceSelection = raw["enforceSourceSelection"];
  }

  return { ok: true, data };
}

function validateLine(
  rawLine: unknown,
  index: number,
): { errors: string[]; line: ValidatedWithdrawalLine | null } {
  const errors: string[] = [];

  if (typeof rawLine !== "object" || rawLine === null) {
    return {
      errors: [`lines[${index}]: must be a non-null object`],
      line: null,
    };
  }

  const line = rawLine as Record<string, unknown>;

  // itemId
  if (typeof line["itemId"] !== "string" || line["itemId"].trim() === "") {
    errors.push(
      `lines[${index}]: itemId is required and must be a non-empty string`,
    );
  }

  // lotId
  if (typeof line["lotId"] !== "string" || line["lotId"].trim() === "") {
    errors.push(
      `lines[${index}]: lotId is required and must be a non-empty string`,
    );
  }

  // locationId
  if (
    typeof line["locationId"] !== "string" ||
    line["locationId"].trim() === ""
  ) {
    errors.push(
      `lines[${index}]: locationId is required and must be a non-empty string`,
    );
  }

  // qty — must be a number > 0
  const qty = line["qty"];
  if (typeof qty !== "number" || qty <= 0) {
    errors.push(`lines[${index}]: qty must be a number greater than 0`);
  }

  if (errors.length > 0) {
    return { errors, line: null };
  }

  const result: ValidatedWithdrawalLine = {
    itemId: (line["itemId"] as string).trim(),
    lotId: (line["lotId"] as string).trim(),
    locationId: (line["locationId"] as string).trim(),
    qty: qty as number,
  };

  if (typeof line["itemCodeIsProvisional"] === "boolean") {
    result.itemCodeIsProvisional = line["itemCodeIsProvisional"] as boolean;
  }

  return { errors: [], line: result };
}
