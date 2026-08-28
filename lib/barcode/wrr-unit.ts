export type WrrUnitPayload = {
  type: "wrr_item_unit";
  wrr_item_id: string;
  unit_id: string;
  carton_id: string;
  unit_index: number;
};

/**
 * Produces a stable UUID for one physical box on a WRR line.
 * Stability matters: reprinting labels must never create a new identity for
 * the same box. The WRR item contributes 96 bits and the 1-based box index
 * contributes 32 bits.
 */
export function deriveWrrUnitId(wrrItemId: string, unitIndex: number): string {
  const source = wrrItemId.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(source)) {
    throw new Error("invalid_wrr_item_id");
  }
  if (!Number.isSafeInteger(unitIndex) || unitIndex < 1 || unitIndex > 0xffffffff) {
    throw new Error("invalid_unit_index");
  }

  const hex = `${source.slice(0, 24)}${unitIndex.toString(16).padStart(8, "0")}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createWrrUnitPayload(wrrItemId: string, unitIndex: number): WrrUnitPayload {
  const unitId = deriveWrrUnitId(wrrItemId, unitIndex);
  return {
    type: "wrr_item_unit",
    wrr_item_id: wrrItemId,
    unit_id: unitId,
    // The QR payload now carries the unique physical-carton identity. The
    // legacy unit_id remains for receiving matcher compatibility.
    carton_id: `DSGC-CTN-${unitId.replaceAll("-", "").toLowerCase()}`,
    unit_index: unitIndex,
  };
}

export function parseWrrUnitPayload(value: string): WrrUnitPayload | null {
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed) as Partial<WrrUnitPayload>;
    if (
      parsed.type !== "wrr_item_unit" ||
      typeof parsed.wrr_item_id !== "string" ||
      typeof parsed.unit_id !== "string" ||
      typeof parsed.carton_id !== "string" ||
      !Number.isSafeInteger(parsed.unit_index) ||
      (parsed.unit_index ?? 0) < 1
    ) {
      return null;
    }
    if (deriveWrrUnitId(parsed.wrr_item_id, parsed.unit_index!) !== parsed.unit_id.toLowerCase()) {
      return null;
    }
    if (parsed.carton_id !== `DSGC-CTN-${parsed.unit_id.replaceAll("-", "").toLowerCase()}`) {
      return null;
    }
    return parsed as WrrUnitPayload;
  } catch {
    return null;
  }
}
