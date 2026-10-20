import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { normalizeItemCode, parseUbotVmiWorkbook } from "../ubot-vmi-adapter";

function workbookBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["CUSTOMER NAME", "ADDRESS 1", "ADDRESS 2", "TERMS", "ACTIVE?"],
    ["UBoT Incorporated Limited", "Address", "", "Net 30 days", "Y"],
    ["Analog Devices Gen. Trias", "", "", "", "Y"],
  ]), "Customers");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["ITEM CODE", "CATEGORY", "DESCRIPTION", "LENGTH (cm)", "WIDTH (cm)", "HEIGHT (cm)", "SPQ (PCS/ROLL)", "NO. BOXES PER PALLET", "VOLUME", "CBM PER BOX"],
    ["3.40010007485E11", "Cover Tape", "UVH49.5-300-R1", 42, 42, 24, 16, 24, 42336, 0.042336],
  ]), "CODES");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["LOCATION ID", "ITEM CODE", "LOT NO.", "QTY", "BOXES ON HAND"],
    ["B06-2", "82012CP138", "C202509003", 4500, 3],
  ]), "Location Matrix");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["CUSTOMER", "CHARGE TYPE", "BASIS", "RATE", "CURRENCY", "ACTIVE", "EFFECTIVE FROM", "EFFECTIVE TO"],
    ["UBoT Incorporated Limited", "Warehousing Charge", "per_cbm_day", 0.38, "USD", "Y", 46023, 46387],
  ]), "Rates");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Location ID"], ["B06-2"], ["RCV"]]), "Racking ID");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["DATE IN"]]), "IN");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

describe("UBoT VMI migration adapter", () => {
  it("expands scientific notation item codes without losing digits", () => {
    expect(normalizeItemCode("3.40010007485E11")).toBe("340010007485");
  });

  it("maps the current-state workbook into master data, opening balances, and rates", () => {
    const draft = parseUbotVmiWorkbook(workbookBuffer());
    expect(draft.profileKey).toBe("ubot-vmi-v1");
    expect(draft.parties.map((party) => party.name)).toContain("UBoT Incorporated Limited");
    expect(draft.items[0].code).toBe("340010007485");
    expect(draft.locations.map((location) => location.label)).toEqual(expect.arrayContaining(["B06-2"]));
    expect(draft.locations.find((location) => location.label === "RCV")?.locationType).toBe("receiving_bay");
    expect(draft.openingBalances[0]).toMatchObject({ itemCode: "82012CP138", lotNumber: "C202509003", quantity: 4500, flowType: "vmi" });
    expect(draft.rates[0]).toMatchObject({ rate: 0.38, currency: "USD" });
    expect(draft.referenceSheets).toContain("IN");
    expect(draft.sourceRows.find((row) => row.phase === "items")?.rawData).toMatchObject({ "item code": "3.40010007485E11" });
    expect(draft.sourceRows.find((row) => row.phase === "items")?.normalizedData).toMatchObject({ code: "340010007485" });
  });

  it("blocks duplicate opening-balance keys instead of creating duplicate stock", () => {
    const workbook = XLSX.read(workbookBuffer(), { type: "buffer" });
    const locationSheet = workbook.Sheets["Location Matrix"];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(locationSheet, { header: 1 });
    XLSX.utils.sheet_add_aoa(locationSheet, [rows[1]], { origin: -1 });
    const draft = parseUbotVmiWorkbook(Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })));
    expect(draft.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate_opening_balance", severity: "blocking" }),
    ]));
  });
});
