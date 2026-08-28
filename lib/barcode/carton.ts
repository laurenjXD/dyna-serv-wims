/** Stable display identifier for a physical carton. */
export function cartonIdFromUnitId(unitId: string): string {
  const normalized = unitId.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new Error("invalid_unit_id");
  }
  return `DSGC-CTN-${normalized}`;
}

export function isCartonId(value: string): boolean {
  return /^(?:DSGC-CTN-|CTN-)[A-Z0-9-]{1,70}$/i.test(value.trim());
}
