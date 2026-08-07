import { sql, type SQL } from "drizzle-orm";

export type AnalyticsFlow = "vmi" | "trading" | "supplies" | "all";
export type DateRange = { startDate: Date; endDate: Date };

export interface AnalyticsExecutor {
  execute<T extends Record<string, unknown>>(query: SQL): Promise<T[]>;
}

// Do not load the complete Drizzle schema at module import time. Analytics
// helpers are unit-tested independently; the database connection is needed
// only when a server query actually executes.
export const defaultAnalyticsExecutor: AnalyticsExecutor = {
  async execute<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
    const { db } = await import("@/lib/db/client");
    return db.execute(query) as Promise<T[]>;
  },
};

export function flowPredicate(column: SQL, flow: AnalyticsFlow): SQL {
  return flow === "all" ? sql`TRUE` : sql`${column} = ${flow}::flow_type`;
}

export function assertDateRange(range: DateRange): void {
  if (Number.isNaN(range.startDate.valueOf()) || Number.isNaN(range.endDate.valueOf()) || range.startDate > range.endDate) {
    throw new Error("Analytics date range must have a valid start date on or before its end date.");
  }
}

export function toNumber(value: number | string | null): number {
  return value === null ? 0 : Number(value);
}
