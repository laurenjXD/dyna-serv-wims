// Party list and detail query helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §7 (Search, list, and detail)
//   specs/06-party-and-item-enrollment/tasks.md §3

import { eq, ilike, or, desc, sql, inArray } from "drizzle-orm";
import { parties, partyRoles, partyRbeClassifications } from "@/lib/db/schema";

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
  roles?: string[];
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
  rbeClassifications: string[];
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

/**
 * Returns the complete organization directory used by cross-master-data
 * filters. This intentionally is not paginated: callers use it to keep
 * organization selectors aligned with the full Organizations tab, including
 * organizations that do not currently own stock at a mapped location.
 *
 * Callers must gate by parties.read before invoking.
 */
export async function listPartyOrganizationNames(db: DbLike): Promise<string[]> {
  const rows = await db
    .select({ name: parties.name })
    .from(parties)
    .orderBy(parties.name);

  return Array.from(
    new Set(
      (rows as Array<{ name: string | null }>)
        .map((row) => row.name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

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

  const partyIds = (rawRows as Array<{ id: string }>).map((r) => r.id);
  const rolesByParty = new Map<string, string[]>();

  if (partyIds.length > 0) {
    try {
      const roleRows = await db
        .select({
          partyId: partyRoles.partyId,
          role: partyRoles.role,
        })
        .from(partyRoles)
        .where(inArray(partyRoles.partyId, partyIds));

      for (const r of (roleRows as Array<{ partyId: string; role: string }>)) {
        const list = rolesByParty.get(r.partyId) ?? [];
        list.push(r.role);
        rolesByParty.set(r.partyId, list);
      }
    } catch {
      // Graceful fallback if party_roles table is unavailable
    }
  }

  const rows = (rawRows as Array<Omit<PartyListRow, "roles">>).map((row) => ({
    ...row,
    roles: rolesByParty.get(row.id) ?? [],
  })) as PartyListRow[];

  return {
    rows,
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

  // The organization record is still useful when optional relationship
  // tables are unavailable during a staggered deployment. Treat these
  // supporting reads as best-effort instead of failing the entire detail page.
  let roleRows: PartyRoleRow[] = [];
  try {
    roleRows = (await db
      .select({
        id: partyRoles.id,
        role: partyRoles.role,
        createdAt: partyRoles.createdAt,
      })
      .from(partyRoles)
      .where(eq(partyRoles.partyId, id))
      .orderBy(partyRoles.role)) as PartyRoleRow[];
  } catch {
    // Role data is optional for rendering the organization identity.
  }

  let rbeRows: Array<{ classification: string }> = [];
  try {
    rbeRows = (await db
      .select({ classification: partyRbeClassifications.classification })
      .from(partyRbeClassifications)
      .where(eq(partyRbeClassifications.partyId, id))
      .orderBy(partyRbeClassifications.classification)) as Array<{ classification: string }>;
  } catch {
    // RBE classifications are optional for rendering the organization detail.
  }

  return {
    ...party,
    roles: roleRows,
    rbeClassifications: rbeRows.map((row) => row.classification.toUpperCase()),
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

export const PARTY_ROLE_CODE_PREFIXES: Record<string, string[]> = {
  supplier: ["SUPPLIER", "SUP"],
  customer: ["CUSTOMER", "CUST"],
  end_customer: ["ENDCUST", "END_CUST", "ECUST"],
  internal_supplies: ["WH", "WAREHOUSE"],
};

const CANONICAL_ROLE_ORDER = [
  "supplier",
  "customer",
  "end_customer",
  "internal_supplies",
];

const ROLE_SHORT_TAGS: Record<string, string> = {
  supplier: "SUP",
  customer: "CUST",
  end_customer: "ENDCUST",
  internal_supplies: "WH",
};

const ROLE_FULL_TAGS: Record<string, string> = {
  supplier: "SUPPLIER",
  customer: "CUSTOMER",
  end_customer: "ENDCUST",
  internal_supplies: "WH",
};

/**
 * Computes the next serialized organization code for a given business role or set of roles.
 * - Single role: SUPPLIER-001, CUSTOMER-001, ENDCUST-001, WH-001, etc.
 * - Multi role: SUP-CUST-001, SUP-ENDCUST-001, CUST-WH-001, etc.
 * - No role / empty: ORG-001
 */
export function computeNextPartyCode(
  roles: string | string[] = [],
  existingCodes: string[] = []
): string {
  const roleList = (Array.isArray(roles) ? roles : [roles])
    .filter(Boolean)
    .map((r) => r.trim().toLowerCase());

  let primaryPrefix = "ORG";
  let searchPrefixes: string[] = ["ORG", "PTY"];

  if (roleList.length === 1) {
    const singleRole = roleList[0];
    searchPrefixes = PARTY_ROLE_CODE_PREFIXES[singleRole] || [singleRole.toUpperCase()];
    primaryPrefix = searchPrefixes[0];
  } else if (roleList.length > 1) {
    const sortedRoles = [...new Set(roleList)].sort((a, b) => {
      const idxA = CANONICAL_ROLE_ORDER.indexOf(a);
      const idxB = CANONICAL_ROLE_ORDER.indexOf(b);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    primaryPrefix = sortedRoles.map((r) => ROLE_SHORT_TAGS[r] || r.toUpperCase()).join("-");

    const fullTagCombined = sortedRoles.map((r) => ROLE_FULL_TAGS[r] || r.toUpperCase()).join("-");
    const underscoreShort = sortedRoles.map((r) => ROLE_SHORT_TAGS[r] || r.toUpperCase()).join("_");
    const underscoreFull = sortedRoles.map((r) => ROLE_FULL_TAGS[r] || r.toUpperCase()).join("_");

    searchPrefixes = Array.from(
      new Set([primaryPrefix, fullTagCombined, underscoreShort, underscoreFull])
    );
  }

  let maxNum = 0;
  for (const code of existingCodes) {
    if (!code) continue;
    const trimmed = code.trim();
    for (const p of searchPrefixes) {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped}-(\\d+)$`, "i");
      const match = trimmed.match(regex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${primaryPrefix}-${String(nextNum).padStart(3, "0")}`;
}
