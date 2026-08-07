// Location list and detail query helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §6a (Location model), §7

import { eq, ilike, or, desc, sql } from "drizzle-orm";
import { locations } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LocationListRow = {
  id: string;
  zone: string;
  rack: string;
  level: string;
  position: string;
  label: string;
  locationType: string;
  maxCbmCapacity: string;
  isActive: boolean;
  createdAt: Date;
};

export type LocationDetail = {
  id: string;
  zone: string;
  rack: string;
  level: string;
  position: string;
  label: string;
  locationType: string;
  maxCbmCapacity: string;
  isActive: boolean;
  createdAt: Date;
};

export type ListResult<T> = {
  rows: T[];
  total: number;
};

export type ListLocationsOpts = {
  search?: string | null;
  limit?: number;
  offset?: number;
};

// ---------------------------------------------------------------------------
// listLocations
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of locations, optionally filtered by search string
 * matched against zone, rack, level, position, label, and location_type.
 * Ordered by label ASC for predictable rack ordering.
 *
 * Callers must gate by locations.read before invoking.
 */
export async function listLocations(
  db: DbLike,
  opts: ListLocationsOpts = {},
): Promise<ListResult<LocationListRow>> {
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim() ?? null;

  const whereClause = search
    ? or(
        ilike(locations.zone, `%${search}%`),
        ilike(locations.rack, `%${search}%`),
        ilike(locations.level, `%${search}%`),
        ilike(locations.position, `%${search}%`),
        ilike(locations.label, `%${search}%`),
        ilike(locations.locationType, `%${search}%`),
      )
    : undefined;

  const rawRows = await db
    .select({
      id: locations.id,
      zone: locations.zone,
      rack: locations.rack,
      level: locations.level,
      position: locations.position,
      label: locations.label,
      locationType: locations.locationType,
      maxCbmCapacity: locations.maxCbmCapacity,
      isActive: locations.isActive,
      createdAt: locations.createdAt,
    })
    .from(locations)
    .where(whereClause)
    .orderBy(locations.label)
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(locations)
    .where(whereClause);

  return {
    rows: rawRows as LocationListRow[],
    total: Number(countRow?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// getLocation
// ---------------------------------------------------------------------------

/**
 * Returns a single location's full detail, or null if not found.
 * Callers must gate by locations.read before invoking.
 */
export async function getLocation(
  db: DbLike,
  id: string,
): Promise<LocationDetail | null> {
  const rows = await db
    .select({
      id: locations.id,
      zone: locations.zone,
      rack: locations.rack,
      level: locations.level,
      position: locations.position,
      label: locations.label,
      locationType: locations.locationType,
      maxCbmCapacity: locations.maxCbmCapacity,
      isActive: locations.isActive,
      createdAt: locations.createdAt,
    })
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);

  return (rows[0] as LocationDetail | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Convenience: re-export desc for external callers that only import from here
// ---------------------------------------------------------------------------
export { desc };
