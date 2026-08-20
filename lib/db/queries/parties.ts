// Party list and detail query helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §7 (Search, list, and detail)
//   specs/06-party-and-item-enrollment/tasks.md §3

import { eq, ilike, or, desc, sql } from "drizzle-orm";
import { parties, partyRoles } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PartyListRow = {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type PartyRoleRow = {
  id: string;
  role: string;
  createdAt: Date;
};

export type PartyDetail = {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  address1: string | null;
  address2: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: PartyRoleRow[];
};

export type ListResult<T> = {
  rows: T[];
  total: number;
};

export type ListPartiesOpts = {
  search?: string | null;
  limit?: number;
  offset?: number;
};

// ---------------------------------------------------------------------------
// listParties
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of parties, optionally filtered by a search string
 * matched against `code` and `name` (case-insensitive). Ordered by created_at DESC.
 *
 * RLS gate is applied at the data-access layer (PostgreSQL). This function
 * does not re-check application-layer capabilities — callers must gate before
 * invoking (parties.read minimum).
 */
export async function listParties(
  db: DbLike,
  opts: ListPartiesOpts = {},
): Promise<ListResult<PartyListRow>> {
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim() ?? null;

  const whereClause = search
    ? or(
        ilike(parties.code, `%${search}%`),
        ilike(parties.name, `%${search}%`),
        ilike(parties.contactPerson, `%${search}%`),
      )
    : undefined;

  const rawRows = await db
    .select({
      id: parties.id,
      code: parties.code,
      name: parties.name,
      contactPerson: parties.contactPerson,
      email: parties.email,
      isActive: parties.isActive,
      createdAt: parties.createdAt,
    })
    .from(parties)
    .where(whereClause)
    .orderBy(desc(parties.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(parties)
    .where(whereClause);

  return {
    rows: rawRows as PartyListRow[],
    total: Number(countRow?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// getPartyWithRoles
// ---------------------------------------------------------------------------

/**
 * Returns a single party with all its party_roles rows, or null if not found.
 * Callers must gate by parties.read before invoking.
 */
export async function getPartyWithRoles(
  db: DbLike,
  id: string,
): Promise<PartyDetail | null> {
  const partyRows = await db
    .select({
      id: parties.id,
      code: parties.code,
      name: parties.name,
      contactPerson: parties.contactPerson,
      email: parties.email,
      phone: parties.phone,
      taxId: parties.taxId,
      address1: parties.address1,
      address2: parties.address2,
      paymentTerms: parties.paymentTerms,
      notes: parties.notes,
      isActive: parties.isActive,
      createdAt: parties.createdAt,
      updatedAt: parties.updatedAt,
    })
    .from(parties)
    .where(eq(parties.id, id))
    .limit(1);

  const party = partyRows[0] as PartyDetail | undefined;
  if (!party) return null;

  const roleRows = await db
    .select({
      id: partyRoles.id,
      role: partyRoles.role,
      createdAt: partyRoles.createdAt,
    })
    .from(partyRoles)
    .where(eq(partyRoles.partyId, id))
    .orderBy(partyRoles.role);

  return {
    ...party,
    roles: roleRows as PartyRoleRow[],
  };
}
