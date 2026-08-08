// lib/transfer/transfer-validator.ts
//
// Pure business-logic validation for transfer request creation input.
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R1.1 — authorized user SHALL request movement
//     from one active source location to one active destination location.
//   specs/11-transfer-and-inspection/requirements.md R1.2 — request SHALL identify item, lot,
//     flow type, quantity/UOM, source/destination, reason, priority, and inspection requirement.
//   specs/11-transfer-and-inspection/requirements.md R1.3 — source and destination SHALL be
//     distinct and valid; a location cannot be its own transfer destination.

export type CreateTransferLine = {
  lotId: string;
  itemId: string;
  qtyRequested: number;
};

export type CreateTransferInput = {
  fromLocationId: string;
  toLocationId: string;
  flowType: "vmi" | "trading" | "supplies";
  lines: CreateTransferLine[];
  reason?: string | null;
  requiresApproval?: boolean;
};

export type CreateTransferResult =
  | { ok: true; data: CreateTransferInput }
  | { ok: false; errors: string[] };

const VALID_FLOW_TYPES = new Set(["vmi", "trading", "supplies"]);

export function validateCreateTransfer(input: unknown): CreateTransferResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["Input must be a non-null object"] };
  }

  const raw = input as Record<string, unknown>;

  // Validate fromLocationId
  if (
    typeof raw["fromLocationId"] !== "string" ||
    raw["fromLocationId"].trim() === ""
  ) {
    errors.push("fromLocationId is required and must be a non-empty string");
  }

  // Validate toLocationId
  if (
    typeof raw["toLocationId"] !== "string" ||
    raw["toLocationId"].trim() === ""
  ) {
    errors.push("toLocationId is required and must be a non-empty string");
  }

  // Validate source !== destination (R1.3) — only check when both are valid strings
  if (
    typeof raw["fromLocationId"] === "string" &&
    raw["fromLocationId"].trim() !== "" &&
    typeof raw["toLocationId"] === "string" &&
    raw["toLocationId"].trim() !== "" &&
    raw["fromLocationId"] === raw["toLocationId"]
  ) {
    errors.push(
      "fromLocationId and toLocationId must be different locations"
    );
  }

  // Validate flowType
  const flowType = raw["flowType"];
  if (typeof flowType !== "string" || !VALID_FLOW_TYPES.has(flowType)) {
    errors.push("flowType must be one of: vmi, trading, supplies");
  }

  // Validate lines
  const rawLines = raw["lines"];
  const validatedLines: CreateTransferLine[] = [];

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    errors.push("lines must be a non-empty array");
  } else {
    for (let i = 0; i < rawLines.length; i++) {
      const result = validateLine(rawLines[i], i);
      errors.push(...result.errors);
      if (result.line !== null) {
        validatedLines.push(result.line);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const data: CreateTransferInput = {
    fromLocationId: raw["fromLocationId"] as string,
    toLocationId: raw["toLocationId"] as string,
    flowType: flowType as "vmi" | "trading" | "supplies",
    lines: validatedLines,
  };

  if (raw["reason"] !== undefined) {
    data.reason = raw["reason"] as string | null;
  }
  if (raw["requiresApproval"] !== undefined) {
    data.requiresApproval = raw["requiresApproval"] as boolean;
  }

  return { ok: true, data };
}

function validateLine(
  rawLine: unknown,
  index: number
): { errors: string[]; line: CreateTransferLine | null } {
  const errors: string[] = [];

  if (typeof rawLine !== "object" || rawLine === null) {
    return {
      errors: [`Line[${index}]: must be a non-null object`],
      line: null,
    };
  }

  const line = rawLine as Record<string, unknown>;

  // lotId: required, non-empty string
  if (typeof line["lotId"] !== "string" || line["lotId"].trim() === "") {
    errors.push(
      `Line[${index}]: lotId is required and must be a non-empty string`
    );
  }

  // itemId: required, non-empty string
  if (typeof line["itemId"] !== "string" || line["itemId"].trim() === "") {
    errors.push(
      `Line[${index}]: itemId is required and must be a non-empty string`
    );
  }

  // qtyRequested: must be > 0
  const qtyRequested = line["qtyRequested"];
  if (typeof qtyRequested !== "number" || qtyRequested <= 0) {
    errors.push(`Line[${index}]: qtyRequested must be a number greater than 0`);
  }

  if (errors.length > 0) {
    return { errors, line: null };
  }

  return {
    errors: [],
    line: {
      lotId: line["lotId"] as string,
      itemId: line["itemId"] as string,
      qtyRequested: qtyRequested as number,
    },
  };
}
