import { describe, expect, it } from "vitest";
import { createWrrUnitPayload, deriveWrrUnitId, parseWrrUnitPayload } from "../wrr-unit";

const WRR_ITEM_ID = "12345678-1234-4abc-8def-1234567890ab";

describe("durable WRR box identity", () => {
  it("reprints the same box with the same ID", () => {
    expect(deriveWrrUnitId(WRR_ITEM_ID, 3)).toBe(deriveWrrUnitId(WRR_ITEM_ID, 3));
  });

  it("gives different boxes different IDs", () => {
    expect(deriveWrrUnitId(WRR_ITEM_ID, 2)).not.toBe(deriveWrrUnitId(WRR_ITEM_ID, 3));
  });

  it("round-trips an authentic payload and rejects a changed unit ID", () => {
    const payload = createWrrUnitPayload(WRR_ITEM_ID, 4);
    expect(parseWrrUnitPayload(JSON.stringify(payload))).toEqual(payload);
    expect(parseWrrUnitPayload(JSON.stringify({ ...payload, unit_id: deriveWrrUnitId(WRR_ITEM_ID, 5) }))).toBeNull();
  });
});
