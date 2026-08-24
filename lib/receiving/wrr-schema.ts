// lib/receiving/wrr-schema.ts
//
// Pure business-logic validation for WRR creation input.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5.1 — Expected line fields
//   specs/07-incoming-receiving/design.md §5.2 — Scan-line state: expectedQty > 0 invariant
//   specs/07-incoming-receiving/design.md §7.1 — disposition defaults to 'store'
//   specs/07-incoming-receiving/requirements.md R1.2 — vendorPartyId, flowType, commercialInvoiceNo
//   specs/07-incoming-receiving/requirements.md R1.3 — line fields: item, lot_number, expected_qty, UOM, unit_cbm, disposition
//   specs/07-incoming-receiving/requirements.md R5.1 — disposition must be 'store' or 'inspect'
//   specs/07-incoming-receiving/requirements.md R1.4 (amended 2026-08-10) — a store-disposition
//     line SHALL NOT be required to carry a putawayLocationId at WRR creation or staging time;
//     it is populated per line at scan/store time instead (see design.md §5.1 "Reversed 2026-08-10")

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateWrrLine = {
  lotNumber: string;
  expectedQty: number;
  unitCbm: number;
  uom: string;
  disposition: "store" | "inspect";
  putawayLocationId?: string | null;
  itemId?: string | null;
  itemCode?: string | null;
  customerItemCode?: string | null;
  manufactureDate?: string | null;
  remarks?: string | null;
  barcode?: string | null;
};

export type CreateWrrInput = {
  // Client-generated (crypto.randomUUID()) so a CIPL file can be uploaded to
  // its final Storage path (specs/04-services-and-infrastructure/design.md
  // §10.2: `cipl/{wrr_id}/{upload_uuid}/{sanitized-filename}`) before the
  // wrr_documents row exists to reference. Optional: callers that never
  // attach a CIPL file omit it and the database default (defaultRandom())
  // applies as before.
  id?: string;
  vendorPartyId: string;
  flowType: "vmi" | "trading" | "supplies";
  commercialInvoiceNo?: string | null;
  ciplFileUrl?: string | null;
  pezaNumber?: string | null;
  ipNumber?: string | null;
  mawbMblNumber?: string | null;
  lines: CreateWrrLine[];
};

export type CreateWrrResult =
  | { ok: true; data: CreateWrrInput }
  | { ok: false; errors: string[] };

const VALID_FLOW_TYPES = new Set(["vmi", "trading", "supplies"]);
const VALID_DISPOSITIONS = new Set(["store", "inspect"]);

export function validateCreateWrr(input: unknown): CreateWrrResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["Input must be a non-null object"] };
  }

  const raw = input as Record<string, unknown>;

  // Validate id (optional — see CreateWrrInput's own doc comment)
  const rawId = raw["id"];
  if (rawId !== undefined && rawId !== null) {
    if (typeof rawId !== "string" || !UUID_PATTERN.test(rawId)) {
      errors.push("id, when provided, must be a valid UUID");
    }
  }

  // Validate vendorPartyId
  if (typeof raw["vendorPartyId"] !== "string" || raw["vendorPartyId"].trim() === "") {
    errors.push("vendorPartyId is required and must be a non-empty string");
  }

  // Validate flowType
  const flowType = raw["flowType"];
  if (typeof flowType !== "string" || !VALID_FLOW_TYPES.has(flowType)) {
    errors.push("flowType must be one of: vmi, trading, supplies");
  }

  // Validate commercialInvoiceNo: if present and non-null, must not be empty string
  const commercialInvoiceNo = raw["commercialInvoiceNo"];
  if (commercialInvoiceNo !== undefined && commercialInvoiceNo !== null) {
    if (typeof commercialInvoiceNo !== "string" || commercialInvoiceNo.trim() === "") {
      errors.push("commercialInvoiceNo, when provided, must be a non-empty string");
    }
  }

  // Validate lines
  const rawLines = raw["lines"];
  const validatedLines: CreateWrrLine[] = [];

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

  // Build the validated output data
  const data: CreateWrrInput = {
    vendorPartyId: raw["vendorPartyId"] as string,
    flowType: flowType as "vmi" | "trading" | "supplies",
    lines: validatedLines,
  };

  if (rawId !== undefined && rawId !== null) {
    data.id = rawId as string;
  }
  if (commercialInvoiceNo !== undefined) {
    data.commercialInvoiceNo = commercialInvoiceNo as string | null;
  }
  if (raw["ciplFileUrl"] !== undefined) {
    data.ciplFileUrl = raw["ciplFileUrl"] as string | null;
  }
  if (raw["pezaNumber"] !== undefined) {
    data.pezaNumber = raw["pezaNumber"] as string | null;
  }
  if (raw["ipNumber"] !== undefined) {
    data.ipNumber = raw["ipNumber"] as string | null;
  }
  if (raw["mawbMblNumber"] !== undefined) {
    data.mawbMblNumber = raw["mawbMblNumber"] as string | null;
  }

  return { ok: true, data };
}

function validateLine(
  rawLine: unknown,
  index: number
): { errors: string[]; line: CreateWrrLine | null } {
  const errors: string[] = [];

  if (typeof rawLine !== "object" || rawLine === null) {
    return {
      errors: [`Line[${index}]: must be a non-null object`],
      line: null,
    };
  }

  const line = rawLine as Record<string, unknown>;

  // lotNumber: required, non-empty string
  if (typeof line["lotNumber"] !== "string" || line["lotNumber"].trim() === "") {
    errors.push(`Line[${index}]: lotNumber is required and must be a non-empty string`);
  }

  // expectedQty: must be > 0
  const expectedQty = line["expectedQty"];
  if (typeof expectedQty !== "number" || expectedQty <= 0) {
    errors.push(`Line[${index}]: expectedQty must be a number greater than 0`);
  }

  // unitCbm: must be > 0
  const unitCbm = line["unitCbm"];
  if (typeof unitCbm !== "number" || unitCbm <= 0) {
    errors.push(`Line[${index}]: unitCbm must be a number greater than 0`);
  }

  // disposition: must be 'store' or 'inspect'; defaults to 'store' if omitted/undefined
  let disposition: "store" | "inspect" = "store";
  const rawDisposition = line["disposition"];
  if (rawDisposition === undefined || rawDisposition === null) {
    disposition = "store";
  } else if (typeof rawDisposition === "string" && VALID_DISPOSITIONS.has(rawDisposition)) {
    disposition = rawDisposition as "store" | "inspect";
  } else {
    errors.push(`Line[${index}]: disposition must be 'store' or 'inspect'`);
  }

  // putawayLocationId is no longer required for store-disposition lines at
  // WRR creation time (Reversed 2026-08-10, see design.md §5.1 / R1.4
  // amended 2026-08-10). It is populated per line at scan/store time
  // instead. A caller-supplied value, if present, is still validated below.
  const putawayLocationId = line["putawayLocationId"];
  if (
    putawayLocationId !== undefined &&
    putawayLocationId !== null &&
    (typeof putawayLocationId !== "string" || putawayLocationId.trim() === "")
  ) {
    errors.push(`Line[${index}]: putawayLocationId must be a non-empty string when provided`);
  }

  const manufactureDate = line["manufactureDate"];
  if (
    manufactureDate !== undefined &&
    manufactureDate !== null &&
    (typeof manufactureDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(manufactureDate))
  ) {
    errors.push(`Line[${index}]: manufactureDate must be an ISO date (YYYY-MM-DD) when provided`);
  }

  const remarks = line["remarks"];
  if (remarks !== undefined && remarks !== null && typeof remarks !== "string") {
    errors.push(`Line[${index}]: remarks must be text when provided`);
  }

  if (errors.length > 0) {
    return { errors, line: null };
  }

  return {
    errors: [],
    line: {
      lotNumber: line["lotNumber"] as string,
      expectedQty: expectedQty as number,
      unitCbm: unitCbm as number,
      uom: typeof line["uom"] === "string" ? line["uom"] : "",
      disposition,
      putawayLocationId:
        typeof putawayLocationId === "string" ? putawayLocationId : null,
      itemId: (line["itemId"] as string | null | undefined) ?? null,
      itemCode: (line["itemCode"] as string | null | undefined) ?? null,
      customerItemCode: (line["customerItemCode"] as string | null | undefined) ?? null,
      manufactureDate: (manufactureDate as string | null | undefined) || null,
      remarks: (remarks as string | null | undefined)?.trim() || null,
      barcode: (line["barcode"] as string | null | undefined) ?? null,
    },
  };
}
