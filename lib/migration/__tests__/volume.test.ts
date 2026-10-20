import { describe, expect, it } from "vitest";
import { migrationVolumeCbm } from "../volume";

describe("migrationVolumeCbm", () => {
  it("uses a positive fallback when the workbook has no CBM", () => {
    expect(migrationVolumeCbm(undefined)).toBe("0.0001");
    expect(migrationVolumeCbm(0)).toBe("0.0001");
    expect(migrationVolumeCbm(Number.NaN)).toBe("0.0001");
  });

  it("preserves valid CBM values at the database precision", () => {
    expect(migrationVolumeCbm(0.042336)).toBe("0.0423");
  });

  it("does not round a tiny positive value down to zero", () => {
    expect(migrationVolumeCbm(0.00001)).toBe("0.0001");
  });
});
