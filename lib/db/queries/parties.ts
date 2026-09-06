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

// ---------------------------------------------------------------------------
// Serialization & Code Suggestion Helpers
// ---------------------------------------------------------------------------

/**
 * Returns all active party organization codes for collision prevention and next-serial calculation.
 */
export async function getAllPartyCodes(db: DbLike): Promise<string[]> {
  const rows = await db
    .select({ code: parties.code })
    .from(parties);

  return (rows as Array<{ code: string }>).map((r) => r.code);
}

export const PARTY_ROLE_CODE_PREFIXES: Record<string, string> = {
  vendor: "VENDOR",
  supplier: "SUPPLIER",
  customer: "CUSTOMER",
  end_customer: "ENDCUST",
  internal_warehouse: "WH",
};

/**
 * Computes the next serialized organization code for a given business role.
 * e.g. VENDOR-001, VENDOR-002, SUPPLIER-001, CUSTOMER-001, etc.
 */
export function computeNextPartyCode(
  role: string = "vendor",
  existingCodes: string[] = []
): string {
  const prefix = PARTY_ROLE_CODE_PREFIXES[role] ?? "ORG";
  const regex = new RegExp(`^${prefix}-(\\d+)$`, "i");

  let maxNum = 0;
  for (const code of existingCodes) {
    if (!code) continue;
    const match = code.trim().match(regex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${prefix}-${String(nextNum).padStart(3, "0")}`;
}
