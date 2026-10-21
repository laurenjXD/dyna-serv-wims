export type LocationMapStatus =
  | "unavailable"
  | "available"
  | "occupied"
  | "near_capacity"
  | "full";

export type LocationMapStatusInput = {
  isActive: boolean;
  maxCbmCapacity: number | string | null | undefined;
  occupiedCbm: number | string | null | undefined;
  isMapped?: boolean;
};

/**
 * A mapped rack slot is usable when it is empty, even if an older location
 * row has stale inactive/capacity metadata. Keep unavailable for records
 * outside the reference geometry, but render mapped empty slots as available.
 */
export function getMapCellDisplayStatus(
  status: LocationMapStatus | undefined,
  occupiedCbm: number | string | null | undefined,
): Exclude<LocationMapStatus, "unavailable"> {
  if (status !== undefined && status !== "unavailable") return status;
  return Number(occupiedCbm ?? 0) > 0 ? "occupied" : "available";
}

export function getLocationMapStatus({
  isActive,
  maxCbmCapacity,
  occupiedCbm,
  isMapped = true,
}: LocationMapStatusInput): LocationMapStatus {
  const capacity = Number(maxCbmCapacity ?? 0);
  if (!isActive || !isMapped || !Number.isFinite(capacity) || capacity <= 0) return "unavailable";

  const occupied = Math.max(0, Number(occupiedCbm ?? 0));
  const utilization = occupied / capacity;

  if (occupied <= 0) return "available";
  if (utilization >= 0.9) return "full";
  if (utilization >= 0.75) return "near_capacity";
  return "occupied";
}

export function getLocationUtilizationPct(
  maxCbmCapacity: number | string | null | undefined,
  occupiedCbm: number | string | null | undefined,
): number | null {
  const capacity = Number(maxCbmCapacity ?? 0);
  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  const occupied = Math.max(0, Number(occupiedCbm ?? 0));
  return Math.round((occupied / capacity) * 1000) / 10;
}

