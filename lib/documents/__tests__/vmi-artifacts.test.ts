import { describe, expect, it } from "vitest";
import {
  buildVmiArtifactPath,
  buildVmiDocumentNumber,
  hashVmiDocumentSnapshot,
  VMI_DOCUMENT_TYPES,
} from "../vmi-artifacts";

describe("VMI document artifact contract", () => {
  it("defines exactly the required four document types", () => {
    expect(VMI_DOCUMENT_TYPES).toEqual([
      "vmi_billing_statement",
      "vmi_warehousing_charges",
      "vmi_statement_of_account",
      "vmi_letter_of_authority",
    ]);
  });

  it("uses a unique document number while preserving the common period reference", () => {
    expect(buildVmiDocumentNumber("VMI-2026-06-DYNA", "vmi_statement_of_account")).toBe("VMI-2026-06-DYNA-SOA");
  });

  it("builds a private, source-keyed Storage path and stable content hash", () => {
    expect(buildVmiArtifactPath("period-1", "document-1", "vmi_billing_statement")).toBe("vmi-billing/period-1/document-1/vmi_billing_statement.pdf");
    expect(hashVmiDocumentSnapshot({ period: "VMI-1", total: "10.00" })).toBe(hashVmiDocumentSnapshot({ period: "VMI-1", total: "10.00" }));
  });
});
