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

