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
  update: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const SAMPLE_ORGANIZATIONS = [
  { code: "SAMPLE-ORG-001", name: "Northstar Components Inc.", contactPerson: "Ana Reyes", email: "ana.reyes@northstar.example", phone: "+63 917 555 0101", taxId: "TIN-100-000-001", address1: "101 Innovation Drive", address2: "Laguna Technopark, Biñan, Laguna", paymentTerms: "Net 30", notes: "Sample VMI partner." },
  { code: "SAMPLE-ORG-002", name: "Pacific Trade Solutions", contactPerson: "Miguel Santos", email: "miguel.santos@pacifictrade.example", phone: "+63 917 555 0102", taxId: "TIN-100-000-002", address1: "22 Commerce Avenue", address2: "Makati City, Metro Manila", paymentTerms: "Net 45", notes: "Sample trading supplier." },
  { code: "SAMPLE-ORG-003", name: "Summit Industrial Supply", contactPerson: "Lea Cruz", email: "lea.cruz@summitindustrial.example", phone: "+63 917 555 0103", taxId: "TIN-100-000-003", address1: "88 Logistics Road", address2: "Cabuyao, Laguna", paymentTerms: "COD", notes: "Sample supplies partner." },
] as const;

const SAMPLE_ITEMS = [
  {
    code: "SAMPLE-ITEM-001",
    name: "Sample Item One",
    barcode: "SAMPLE-BARCODE-001",
    dsgcItemNumber: "SAMPLE-DSGC-001",
    supplierItemCode: "SAMPLE-SUPPLIER-001",
    customerItemCode: "CUST-NS-001",
    description: "Sample palletized electronic components for testing the complete receiving flow.",
    itemType: "raw_material",
    uom: "pallet",
    currency: "PHP",
    buyingPrice: "12500.0000",
    sellingPrice: "14500.0000",
    spq: 1,
    lengthCm: "120.00",
    widthCm: "100.00",
    heightCm: "100.00",
    volumeCm3: "1200000.00",
    volumeCbm: "1.2000",
    boxesPerPallet: 24,
    weightKg: "450.000",
    minReorderLevel: 1,
  },
  {
    code: "SAMPLE-ITEM-002",
    name: "Sample Item Two",
    barcode: "SAMPLE-BARCODE-002",
    dsgcItemNumber: "SAMPLE-DSGC-002",
    supplierItemCode: "SAMPLE-SUPPLIER-002",
    customerItemCode: "CUST-PT-002",
    description: "Sample palletized trading item for pick and dispatch testing.",
    itemType: "finished_good",
    uom: "pallet",
    currency: "PHP",
    buyingPrice: "9800.0000",
    sellingPrice: "12100.0000",
    spq: 1,
    lengthCm: "120.00",
    widthCm: "100.00",
    heightCm: "110.00",
    volumeCm3: "1320000.00",
    volumeCbm: "1.3200",
    boxesPerPallet: 18,
    weightKg: "390.000",
    minReorderLevel: 1,
  },
  {
    code: "SAMPLE-ITEM-003",
    name: "Sample Item Three",
    barcode: "SAMPLE-BARCODE-003",
    dsgcItemNumber: "SAMPLE-DSGC-003",
    supplierItemCode: "SAMPLE-SUPPLIER-003",
    customerItemCode: "CUST-SI-003",
    description: "Sample palletized industrial supply for receiving and inspection testing.",
    itemType: "packaging",
    uom: "pallet",
    currency: "PHP",
    buyingPrice: "7400.0000",
    sellingPrice: "9100.0000",
    spq: 1,
    lengthCm: "120.00",
    widthCm: "100.00",
    heightCm: "90.00",
    volumeCm3: "1080000.00",
    volumeCbm: "1.0800",
    boxesPerPallet: 30,
    weightKg: "320.000",
    minReorderLevel: 1,
  },
] as const;

const SAMPLE_WRRS = [
  { number: "SAMPLE-WRR-001", invoice: "SAMPLE-CIPL-001", lotNumber: "SAMPLE-LOT-001", quantity: 3, flowType: "vmi" as const, pezaNumber: "PEZA-SAMPLE-001", ipNumber: "IP-SAMPLE-001", mawbMblNumber: "MAWB-SAMPLE-001" },
  { number: "SAMPLE-WRR-002", invoice: "SAMPLE-CIPL-002", lotNumber: "SAMPLE-LOT-002", quantity: 4, flowType: "trading" as const, pezaNumber: "PEZA-SAMPLE-002", ipNumber: "IP-SAMPLE-002", mawbMblNumber: "MAWB-SAMPLE-002" },
  { number: "SAMPLE-WRR-003", invoice: "SAMPLE-CIPL-003", lotNumber: "SAMPLE-LOT-003", quantity: 5, flowType: "supplies" as const, pezaNumber: "PEZA-SAMPLE-003", ipNumber: "IP-SAMPLE-003", mawbMblNumber: "MAWB-SAMPLE-003" },
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
        } else {
          await db
            .update(parties)
            .set({ ...organization, isActive: true, updatedAt: new Date() })
            .where(eq(parties.id, organizationId));
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
              isPerishable: false,
              isActive: true,
            })
            .returning({ id: items.id });
          itemId = inserted.id;
          created.items += 1;
        } else {
          // Refresh every sample field on repeated runs without creating a
          // duplicate record, so the three examples stay complete and usable.
          await db
            .update(items)
            .set({
              ...item,
              defaultSupplierPartyId: organizationIds[index],
              isPerishable: false,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(items.id, itemId));
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
              commercialInvoiceNo: sampleWrr.invoice,
              vendorPartyId: organizationIds[index],
              flowType: sampleWrr.flowType,
              pezaNumber: sampleWrr.pezaNumber,
              ipNumber: sampleWrr.ipNumber,
              mawbMblNumber: sampleWrr.mawbMblNumber,
              status: "staged_pending_arrival",
              stagedByUserId: receivingPermission.context.userId,
            })
            .returning({ id: wrrDocuments.id });
          wrrId = inserted.id;
          created.wrrs += 1;
        } else {
          await db
            .update(wrrDocuments)
            .set({
              commercialInvoiceNo: sampleWrr.invoice,
              vendorPartyId: organizationIds[index],
              flowType: sampleWrr.flowType,
              pezaNumber: sampleWrr.pezaNumber,
              ipNumber: sampleWrr.ipNumber,
              mawbMblNumber: sampleWrr.mawbMblNumber,
              updatedAt: new Date(),
            })
            .where(eq(wrrDocuments.id, wrrId));
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
            unitCbm: SAMPLE_ITEMS[index].volumeCbm,
            uom: SAMPLE_ITEMS[index].uom,
            disposition: "store",
          });
        } else {
          await db
            .update(wrrItems)
            .set({
              itemCode: SAMPLE_ITEMS[index].code,
              lotNumber: sampleWrr.lotNumber,
              expectedQty: sampleWrr.quantity,
              unitCbm: SAMPLE_ITEMS[index].volumeCbm,
              uom: SAMPLE_ITEMS[index].uom,
              disposition: "store",
            })
            .where(eq(wrrItems.id, expectedLine[0].id));
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
