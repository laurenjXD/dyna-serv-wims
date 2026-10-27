/* eslint-disable @typescript-eslint/no-explicit-any */
import { asc, desc, eq } from "drizzle-orm";
import { cycleCountLines, cycleCountSessions } from "@/lib/db/schema/cycle_count";
import { items } from "@/lib/db/schema/items";
import { locations } from "@/lib/db/schema/locations";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { lots } from "@/lib/db/schema/lots";

export type DbLike = { select: (...args: any[]) => any };

export type CycleCountSessionRow = {
  id: string;
  countNumber: string;
  locationId: string;
  locationLabel: string | null;
  status: string;
  snapshotAt: Date;
  createdAt: Date;
  createdByUserId: string;
  lineCount: number;
  countedLineCount: number;
  totalVariance: number;
};

export type CycleCountLineRow = {
  id: string;
  sessionId: string;
  balanceId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationLabel: string | null;
  systemQty: number;
  countedQty: number | null;
  variance: number | null;
  status: string;
};

export async function listCycleCountSessions(db: DbLike): Promise<CycleCountSessionRow[]> {
  const rows = await db.select({
    id: cycleCountSessions.id,
    countNumber: cycleCountSessions.countNumber,
    locationId: cycleCountSessions.locationId,
    locationLabel: locations.label,
    status: cycleCountSessions.status,
    snapshotAt: cycleCountSessions.snapshotAt,
    createdAt: cycleCountSessions.createdAt,
    createdByUserId: cycleCountSessions.createdByUserId,
    lineCount: cycleCountLines.id,
  }).from(cycleCountSessions)
    .innerJoin(locations, eq(locations.id, cycleCountSessions.locationId))
    .leftJoin(cycleCountLines, eq(cycleCountLines.sessionId, cycleCountSessions.id))
    .orderBy(desc(cycleCountSessions.createdAt));

  const grouped = new Map<string, CycleCountSessionRow>();
  for (const row of rows as Array<any>) {
    const existing = grouped.get(row.id) ?? {
      id: row.id, countNumber: row.countNumber, locationId: row.locationId, locationLabel: row.locationLabel,
      status: row.status, snapshotAt: row.snapshotAt, createdAt: row.createdAt, createdByUserId: row.createdByUserId,
      lineCount: 0, countedLineCount: 0, totalVariance: 0,
    };
    if (row.lineCount) existing.lineCount += 1;
    grouped.set(row.id, existing);
  }

  for (const session of grouped.values()) {
    const lines = await db.select({ status: cycleCountLines.status, variance: cycleCountLines.variance })
      .from(cycleCountLines).where(eq(cycleCountLines.sessionId, session.id));
    session.countedLineCount = lines.filter((line: any) => line.status !== "uncounted").length;
    session.totalVariance = lines.reduce((sum: number, line: any) => sum + Number(line.variance ?? 0), 0);
  }
  return [...grouped.values()];
}

export async function getCycleCountSession(db: DbLike, sessionId: string) {
  const [session] = await db.select({
    id: cycleCountSessions.id,
    countNumber: cycleCountSessions.countNumber,
    locationId: cycleCountSessions.locationId,
    locationLabel: locations.label,
    status: cycleCountSessions.status,
    snapshotAt: cycleCountSessions.snapshotAt,
    createdByUserId: cycleCountSessions.createdByUserId,
  }).from(cycleCountSessions).innerJoin(locations, eq(locations.id, cycleCountSessions.locationId))
    .where(eq(cycleCountSessions.id, sessionId)).limit(1);
  if (!session) return null;

  const lines = await db.select({
    id: cycleCountLines.id,
    sessionId: cycleCountLines.sessionId,
    balanceId: cycleCountLines.balanceId,
    itemId: cycleCountLines.itemId,
    itemCode: items.code,
    itemName: items.name,
    lotId: cycleCountLines.lotId,
    lotNumber: lots.lotNumber,
    locationId: cycleCountLines.locationId,
    locationLabel: locations.label,
    systemQty: cycleCountLines.systemQty,
    countedQty: cycleCountLines.countedQty,
    variance: cycleCountLines.variance,
    status: cycleCountLines.status,
  }).from(cycleCountLines)
    .innerJoin(items, eq(items.id, cycleCountLines.itemId))
    .innerJoin(lots, eq(lots.id, cycleCountLines.lotId))
    .innerJoin(locations, eq(locations.id, cycleCountLines.locationId))
    .where(eq(cycleCountLines.sessionId, sessionId)).orderBy(asc(items.code), asc(lots.lotNumber));
  return { session, lines: lines as CycleCountLineRow[] };
}

export async function listCountLocations(db: DbLike) {
  return db.select({ id: locations.id, label: locations.label, zone: locations.zone })
    .from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.label));
}

export async function listCountableBalances(db: DbLike, locationId: string) {
  return db.select({
    balanceId: lotLocationBalances.id,
    itemId: items.id,
    itemCode: items.code,
    itemName: items.name,
    lotId: lots.id,
    lotNumber: lots.lotNumber,
    systemQty: lotLocationBalances.qtyRemaining,
    committedQty: lotLocationBalances.qtyCommitted,
  }).from(lotLocationBalances).innerJoin(lots, eq(lots.id, lotLocationBalances.lotId))
    .innerJoin(items, eq(items.id, lots.itemId)).where(eq(lotLocationBalances.locationId, locationId));
}

/* eslint-enable @typescript-eslint/no-explicit-any */
