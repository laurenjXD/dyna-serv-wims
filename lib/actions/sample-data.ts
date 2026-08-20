"use server";

// Administrator sample-data command. It deliberately creates staged WRRs only:
// staging documents is not inventory, so this gives a complete, safe demo of
// enrollment -> receiving without manufacturing stock or ledger transactions.

import { and, eq } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { parties, partyRoles } from "@/lib/db/schema/parties";
import { items } from "@/lib/db/schema/items";
import { wrrDocuments, wrrItems } from "@/lib/db/schema/wrr";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const SAMPLE_ORGANIZATIONS = [
  { code: "SAMPLE-ORG-001", name: "Sample Organization One" },
  { code: "SAMPLE-ORG-002", name: "Sample Organization Two" },
  { code: "SAMPLE-ORG-003", name: "Sample Organization Three" },
] as const;

const SAMPLE_ITEMS = [
  {
    code: "SAMPLE-ITEM-001",
    name: "Sample Item One",
    barcode: "SAMPLE-BARCODE-001",
  },
  {
    code: "SAMPLE-ITEM-002",
    name: "Sample Item Two",
    barcode: "SAMPLE-BARCODE-002",
  },
  {
    code: "SAMPLE-ITEM-003",
    name: "Sample Item Three",
    barcode: "SAMPLE-BARCODE-003",
  },
] as const;

const SAMPLE_WRRS = [
  { number: "SAMPLE-WRR-001", lotNumber: "SAMPLE-LOT-001", quantity: 10 },
  { number: "SAMPLE-WRR-002", lotNumber: "SAMPLE-LOT-002", quantity: 20 },
  { number: "SAMPLE-WRR-003", lotNumber: "SAMPLE-LOT-003", quantity: 30 },
] as const;

export type SeedSampleDataResult =
  | {
      ok: true;
      created: { organizations: number; items: number; wrrs: number };
    }
  | { ok: false; error: string };

/**
 * Creates exactly three deterministic sample organizations, items, and staged
 * WRRs. Existing sample rows are reused, making retries and repeated clicks
 * idempotent. The combined capabilities are currently granted to
 * administrators; the check stays capability-based rather than role-based.
 */
export async function seedSampleData(
  resolver: RequestAuthorizationResolver,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<SeedSampleDataResult> {
  const [partiesPermission, itemsPermission, receivingPermission] =
    await Promise.all([
      requirePermission(resolver, "parties.manage"),
      requirePermission(resolver, "items.manage"),
      requirePermission(resolver, "receiving.confirm"),
    ]);
  if (
    partiesPermission.kind !== "authorized" ||
    itemsPermission.kind !== "authorized" ||
    receivingPermission.kind !== "authorized"
  ) {
    return {
      ok: false,
      error: "You do not have permission to add sample data.",
    };
  }

  let rlsResult: Awaited<
    ReturnType<typeof withRlsTransaction<SeedSampleDataResult>>
  >;
  try {
    rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
      const db = tx.db as DbLike;
      const organizationIds: string[] = [];
      const itemIds: string[] = [];
      const created = { organizations: 0, items: 0, wrrs: 0 };

      for (const organization of SAMPLE_ORGANIZATIONS) {
        const existing = await db
          .select({ id: parties.id })
          .from(parties)
          .where(eq(parties.code, organization.code))
          .limit(1);

        let organizationId = existing[0]?.id as string | undefined;
        if (!organizationId) {
          const [inserted] = await db
            .insert(parties)
            .values({ ...organization, isActive: true })
            .returning({ id: parties.id });
          organizationId = inserted.id;
          created.organizations += 1;
        }
        if (!organizationId)
          throw new Error("Sample organization could not be created.");
        organizationIds.push(organizationId);

        // The sample organization is usable for its sample inbound WRR.
        const vendorRole = await db
          .select({ id: partyRoles.id })
          .from(partyRoles)
          .where(
            and(
              eq(partyRoles.partyId, organizationId),
              eq(partyRoles.role, "vendor"),
            ),
          )
          .limit(1);
        if (vendorRole.length === 0) {
          await db
            .insert(partyRoles)
            .values({ partyId: organizationId, role: "vendor" });
        }
      }

      for (const [index, item] of SAMPLE_ITEMS.entries()) {
        const existing = await db
          .select({ id: items.id })
          .from(items)
          .where(eq(items.code, item.code))
          .limit(1);

        let itemId = existing[0]?.id as string | undefined;
        if (!itemId) {
          const [inserted] = await db
            .insert(items)
            .values({
              ...item,
              defaultSupplierPartyId: organizationIds[index],
              uom: "piece",
              currency: "USD",
              spq: 1,
              volumeCbm: "0.0100",
              minReorderLevel: 0,
              isPerishable: false,
              isActive: true,
            })
            .returning({ id: items.id });
          itemId = inserted.id;
          created.items += 1;
        }
        if (!itemId) throw new Error("Sample item could not be created.");
        itemIds.push(itemId);
      }

      for (const [index, sampleWrr] of SAMPLE_WRRS.entries()) {
        const existing = await db
          .select({ id: wrrDocuments.id })
          .from(wrrDocuments)
          .where(eq(wrrDocuments.wrrNumber, sampleWrr.number))
          .limit(1);

        let wrrId = existing[0]?.id as string | undefined;
        if (!wrrId) {
          const [inserted] = await db
            .insert(wrrDocuments)
            .values({
              wrrNumber: sampleWrr.number,
              commercialInvoiceNo: `SAMPLE-CIPL-00${index + 1}`,
              vendorPartyId: organizationIds[index],
              flowType: "trading",
              status: "staged_pending_arrival",
              stagedByUserId: receivingPermission.context.userId,
            })
            .returning({ id: wrrDocuments.id });
          wrrId = inserted.id;
          created.wrrs += 1;
        }
        if (!wrrId) throw new Error("Sample WRR could not be created.");

        // Also repair an interrupted earlier seed (header created, line missing)
        // without creating a duplicate document or an extra sample record.
        const expectedLine = await db
          .select({ id: wrrItems.id })
          .from(wrrItems)
          .where(
            and(eq(wrrItems.wrrId, wrrId), eq(wrrItems.itemId, itemIds[index])),
          )
          .limit(1);
        if (expectedLine.length === 0) {
          await db.insert(wrrItems).values({
            wrrId,
            itemId: itemIds[index],
            itemCode: SAMPLE_ITEMS[index].code,
            lotNumber: sampleWrr.lotNumber,
            expectedQty: sampleWrr.quantity,
            unitCbm: "0.0100",
            uom: "piece",
            disposition: "store",
          });
        }
      }

      return { ok: true, created } satisfies SeedSampleDataResult;
    });
  } catch (error) {
    console.error("Sample data creation failed", error);
    return {
      ok: false,
      error:
        "Sample data could not be added. Please try again or contact an administrator.",
    };
  }

  if (rlsResult.kind === "unauthenticated") {
    return {
      ok: false,
      error: "Your session has expired. Please sign in again.",
    };
  }
  return rlsResult.value;
}
