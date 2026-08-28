/** Stable display identifier for a physical carton. */
export function cartonIdFromUnitId(unitId: string): string {
  const normalized = unitId.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new Error("invalid_unit_id");
  }
  // Base-36 is a bijective encoding of the full 128-bit UUID. It is shorter
  // than printing 32 hex characters while retaining the same uniqueness.
  return `DSGC-CTN-${BigInt(`0x${normalized}`).toString(36).padStart(25, "0")}`;
}

export function isCartonId(value: string): boolean {
  return /^(?:DSGC-CTN-|CTN-)[A-Z0-9-]{1,70}$/i.test(value.trim());
}
