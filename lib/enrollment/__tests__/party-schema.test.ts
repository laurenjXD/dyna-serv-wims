// RED-step unit tests for lib/enrollment/party-schema.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md §4 R1.1-R1.3, R1.6, R6.1
//   specs/06-party-and-item-enrollment/design.md §2 (canonical `parties` fields)
//   specs/06-party-and-item-enrollment/design.md §5 Create (server-side validation rules)
//   specs/06-party-and-item-enrollment/tasks.md Testing Matrix §Unit tests
//
// Acceptance criteria covered (requirements.md §5):
//   AC: "An authorized administrator can create ... a party with business roles
//       without creating application-user access."
//   AC: "Duplicate party codes, item codes, and barcodes are prevented both
//       before submit and by the authoritative database constraint."
//   AC: "Cross-party, unauthorized, stale-edit, and direct-identifier
//       manipulation cases fail safely."
//
// Expected module contract for lib/enrollment/party-schema.ts (for backend-builder):
//
//   export type PartyInput = {
//     code: string;
//     name: string;
//     contactPerson?: string | null;
//     email?: string | null;
//     phone?: string | null;
//     taxId?: string | null;
//     address?: string | null;
//     notes?: string | null;
//     isActive?: boolean;
//   }
//
//   export type FieldError = { field: string; message: string };
//
//   export type ParseResult<T> =
//     | { success: true; data: T }
//     | { success: false; errors: FieldError[] }
//
//   export function parsePartyInput(input: unknown): ParseResult<PartyInput>
//   // Normalizes and validates. On success, returns structured PartyInput.
//   // On failure, returns a FieldError array pinpointing the offending field(s).
//   // isActive defaults to true when omitted.

import { describe, expect, it } from "vitest";
import { parsePartyInput } from "@/lib/enrollment/party-schema";

// ---------------------------------------------------------------------------
// R1.2 — party `code` validation
// ---------------------------------------------------------------------------

describe("parsePartyInput — code field (R1.2, design.md §2 parties.code varchar 50 NOT NULL UNIQUE)", () => {
  it("rejects missing code (R1.2: code is required)", () => {
    const result = parsePartyInput({ name: "Acme Corp" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const codeError = result.errors.find((e) => e.field === "code");
      expect(codeError).toBeDefined();
    }
  });

  it("rejects empty string code (R1.2: code is required)", () => {
    const result = parsePartyInput({ code: "", name: "Acme Corp" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const codeError = result.errors.find((e) => e.field === "code");
      expect(codeError).toBeDefined();
    }
  });

  it("rejects code exceeding 50 characters (design.md §2 varchar 50)", () => {
    const longCode = "X".repeat(51);
    const result = parsePartyInput({ code: longCode, name: "Acme Corp" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const codeError = result.errors.find((e) => e.field === "code");
      expect(codeError).toBeDefined();
    }
  });

  it("accepts code exactly at 50 characters", () => {
    const maxCode = "A".repeat(50);
    const result = parsePartyInput({ code: maxCode, name: "Acme Corp" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid short code", () => {
    const result = parsePartyInput({ code: "ACME-001", name: "Acme Corp" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R1.3 — party `name` validation
// ---------------------------------------------------------------------------

describe("parsePartyInput — name field (R1.3, design.md §2 parties.name varchar 255 NOT NULL)", () => {
  it("rejects missing name (R1.3: name is required)", () => {
    const result = parsePartyInput({ code: "ACME-001" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameError = result.errors.find((e) => e.field === "name");
      expect(nameError).toBeDefined();
    }
  });

  it("rejects empty string name (R1.3: name is required)", () => {
    const result = parsePartyInput({ code: "ACME-001", name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameError = result.errors.find((e) => e.field === "name");
      expect(nameError).toBeDefined();
    }
  });

  it("rejects name exceeding 255 characters (design.md §2 varchar 255)", () => {
    const longName = "N".repeat(256);
    const result = parsePartyInput({ code: "ACME-001", name: longName });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameError = result.errors.find((e) => e.field === "name");
      expect(nameError).toBeDefined();
    }
  });

  it("accepts name exactly at 255 characters", () => {
    const maxName = "N".repeat(255);
    const result = parsePartyInput({ code: "ACME-001", name: maxName });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R1.1 — optional contact/identity fields
// ---------------------------------------------------------------------------

describe("parsePartyInput — optional contact fields (R1.1, design.md §2 nullable columns)", () => {
  it("accepts valid input with all optional fields omitted", () => {
    const result = parsePartyInput({ code: "ACME-001", name: "Acme Corp" });
    expect(result.success).toBe(true);
  });

  it("rejects email that is present but not a valid email format", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailError = result.errors.find((e) => e.field === "email");
      expect(emailError).toBeDefined();
    }
  });

  it("accepts a valid email address when provided", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      email: "contact@acme.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null email (party may have no email address)", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      email: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts phone as optional string", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      phone: "+63-917-123-4567",
    });
    expect(result.success).toBe(true);
  });

  it("accepts taxId as optional string", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      taxId: "123-456-789-000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts address as optional text", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      address: "123 Warehouse St, Calamba, Laguna",
    });
    expect(result.success).toBe(true);
  });

  it("accepts notes as optional text", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      notes: "Key account; requires advance notice for pickup.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts contactPerson as optional string", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      contactPerson: "Maria Santos",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R1.6 — isActive lifecycle defaults
// ---------------------------------------------------------------------------

describe("parsePartyInput — isActive lifecycle (R1.6, design.md §2 is_active boolean NOT NULL default true)", () => {
  it("defaults isActive to true when not provided (R1.6)", () => {
    const result = parsePartyInput({ code: "ACME-001", name: "Acme Corp" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it("accepts isActive = false (explicit deactivation on create is valid input shape)", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      isActive: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });

  it("accepts isActive = true explicitly", () => {
    const result = parsePartyInput({
      code: "ACME-001",
      name: "Acme Corp",
      isActive: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Multiple-field-error accumulation
// ---------------------------------------------------------------------------

describe("parsePartyInput — accumulates multiple field errors", () => {
  it("reports both code and name errors when both are missing", () => {
    const result = parsePartyInput({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain("code");
      expect(fields).toContain("name");
    }
  });

  it("returns a descriptive non-empty message for each field error", () => {
    const result = parsePartyInput({});
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const err of result.errors) {
        expect(typeof err.message).toBe("string");
        expect(err.message.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Full valid shape round-trip
// ---------------------------------------------------------------------------

describe("parsePartyInput — valid full input passes and is returned as structured data", () => {
  it("returns structured PartyInput data on full valid input", () => {
    const input = {
      code: "ACME-001",
      name: "Acme Corporation",
      contactPerson: "Maria Santos",
      email: "maria@acme.com",
      phone: "+63-917-123-4567",
      taxId: "123-456-789-000",
      address: "123 Warehouse St, Calamba, Laguna",
      notes: "Key account",
      isActive: true,
    };
    const result = parsePartyInput(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("ACME-001");
      expect(result.data.name).toBe("Acme Corporation");
      expect(result.data.email).toBe("maria@acme.com");
      expect(result.data.isActive).toBe(true);
    }
  });
});
