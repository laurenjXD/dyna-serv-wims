"use server";
// Receiving server actions — createWrr, recordScan, commitWrr.
//
// Traceability:
//   specs/07-incoming-receiving/requirements.md R1.1 — authorized back-office
//     user creates WRR. R1.3 — expected line fields validated before staging.
//     R1.4 — staged WRR does not create inventory.
//     R3.1 — each scan matched against WRR's expected item/line.
//     R3.2 — system prevents silent over-receipt.
//     R3.3 — wrong/unknown/duplicate/over-quantity scan produces non-success
//     feedback.
//     R3.5 — receipt not confirmable while required lines remain outstanding.
//     R7.1 — all mutations require authenticated, authorized user.
//   specs/07-incoming-receiving/design.md §4 — state model and command
//     boundaries. §5.1 — expected line fields. §9 — receipt commit and
//     idempotency.
//   specs/00-steering/tech.md — RBAC always from session, never client params.
//
// Capabilities required:
//   receiving.confirm — createWrr, commitWrr
//   receiving.scan    — recordScan
//
// These actions are online-only; scan loop and commit are excluded from the
// offline queue (two-stage commitment lifecycle per 08-outgoing spec).

import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { validateCreateWrr } from "@/lib/receiving/wrr-schema";
import { matchScan } from "@/lib/receiving/scan-matcher";
import type { WrrLine } from "@/lib/receiving/scan-matcher";
import { validateLineCommit } from "@/lib/receiving/commit-validation";
import type { CommitLocation } from "@/lib/receiving/commit-validation";
import { wrrDocuments, wrrItems, wrrItemUnitScans, wrrItemPutawayAllocations } from "@/lib/db/schema/wrr";
import { items as itemCatalog } from "@/lib/db/schema/items";
import { lots } from "@/lib/db/schema/lots";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { locations } from "@/lib/db/schema/locations";
import { inspectionCases } from "@/lib/db/schema/transfers";
import { inventoryUnits } from "@/lib/db/schema/inventory_units";
import { deriveWrrUnitId } from "@/lib/barcode/wrr-unit";
import { cartonIdFromUnitId } from "@/lib/barcode/carton";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { getStorageClient } from "@/lib/supabase/storage";
import { validateCiplFile, buildCiplObjectPath } from "@/lib/receiving/cipl-upload";
import { randomUUID } from "node:crypto";

// Every action below binds its DB work to the caller's RLS-claimed
// transaction (specs/02-rbac-roles/design.md §6.3) rather than an
// unauthenticated plain connection. `requirePermission()` remains the
// app-layer capability gate (unchanged); `withRlsTransaction` additionally
// makes the underlying Postgres RLS policies the real, DB-level backstop.
const defaultRlsDeps: RlsTransactionDeps = { getAuthenticatedSession, pool: rlsPool };

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy. Uses named method properties (not an index signature) so
// that PostgresJsDatabase, which has no index signature, is assignable here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction: (callback: (tx: DbLike) => Promise<unknown>) => Promise<unknown>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CreateWrrActionResult =
  | { ok: true; wrrId: string }
  | { ok: false; errors: string[] };

export type RecordScanResult =
  | { ok: true; remainingQty: number; disposition: "store" | "inspect" }
  | { ok: false; reason: string };

export type CommitWrrLineResult = { ok: true } | { ok: false; errors: string[] };
export type CancelWrrResult = { ok: true } | { ok: false; errors: string[] };
export type UpdateWrrResult = { ok: true } | { ok: false; errors: string[] };
export type SetWrrLineDispositionResult = { ok: true } | { ok: false; errors: string[] };

export type UpdateWrrLineInput = {
  id: string;
  lotNumber: string;
  expectedQty: number;
  unitCbm: number;
  uom: string;
  itemCode?: string | null;
  customerItemCode?: string | null;
  manufactureDate?: string | null;
  remarks?: string | null;
};

// ---------------------------------------------------------------------------
// Internal: fetch WRR document with items for action context
// ---------------------------------------------------------------------------
//
// Drizzle returns nested left-join rows (`{ wrr_documents, wrr_items, items }`),
// while the action test double returns flat rows. Normalize both shapes here.

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecord = Record<string, any>;

async function fetchWrrForAction(
  db: DbLike,
  wrrId: string,
): Promise<{
  id: string;
  wrrNumber: string;
  status: string;
  flowType: string;
  vendorPartyId: string;
  stagedByUserId: string;
  commercialInvoiceNo: string | null;
  pezaNumber: string | null;
  ipNumber: string | null;
  items: WrrLine[];
} | null> {
  const allRows: AnyRecord[] = await db
    .select()
    .from(wrrDocuments)
    .leftJoin(wrrItems, eq(wrrItems.wrrId, wrrDocuments.id))
    // A WRR line's supplier item code is not necessarily the barcode printed
    // on the enrolled Dyna-Serv item. Join the catalog record so floor scans
    // can match the registered `items.barcode` value as well.
    .leftJoin(itemCatalog, eq(itemCatalog.id, wrrItems.itemId))
    .where(eq(wrrDocuments.id, wrrId));

  if (allRows.length === 0) return null;

  const first = (allRows[0].wrr_documents ?? allRows[0]) as AnyRecord;

  const items: WrrLine[] = allRows
    .map((joinedRow: AnyRecord) => {
      const line = (joinedRow.wrr_items ?? joinedRow) as AnyRecord;
      const enrolledItem = (joinedRow.items ?? null) as AnyRecord | null;
      return { line, enrolledItem };
    })
    .filter(({ line }) => line.wrrId != null)
    .map(({ line, enrolledItem }) => ({
      id: line.id as string,
      itemId: (line.itemId ?? null) as string | null,
      // Prefer the enrolled item's canonical barcode. `line.barcode` remains
      // a test-double/backward-compatible fallback, then the supplier item
      // code supports legacy labels where no distinct barcode was recorded.
      itemBarcode: (enrolledItem?.barcode ?? line.barcode ?? line.itemCode ?? null) as string | null,
      // Preserve the item code separately so it can be entered manually when
      // a camera or hardware scanner is unavailable.
      itemCode: (enrolledItem?.code ?? line.itemCode ?? null) as string | null,
      lotNumber: line.lotNumber as string,
      manufactureDate: (line.manufactureDate ?? null) as string | null,
      expectedQty: line.expectedQty as number,
      scannedQty: line.scannedQty as number,
      disposition: line.disposition as "store" | "inspect",
      putawayLocationId: (line.putawayLocationId ?? null) as string | null,
      itemFlowType: (enrolledItem?.flowType ?? null) as WrrLine["itemFlowType"],
    }));

  return {
    id: first.id as string,
    wrrNumber: first.wrrNumber as string,
    status: first.status as string,
    flowType: first.flowType as string,
    vendorPartyId: first.vendorPartyId as string,
    stagedByUserId: first.stagedByUserId as string,
    commercialInvoiceNo: (first.commercialInvoiceNo ?? null) as string | null,
    pezaNumber: (first.pezaNumber ?? null) as string | null,
    ipNumber: (first.ipNumber ?? null) as string | null,
    items,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// WRR number generation
// ---------------------------------------------------------------------------

function generateWrrNumber(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  // Six-digit suffix from the last six digits of Date.now() (milliseconds).
  const suffix = String(Date.now()).slice(-6).padStart(6, "0");
  return `WRR-${yyyy}${mm}${dd}-${suffix}`;
}

// ---------------------------------------------------------------------------
// createWrr
// ---------------------------------------------------------------------------

/**
 * Creates a new WRR document (staged_pending_arrival).
 * Requires receiving.confirm capability.
 * Validates input via validateCreateWrr before any DB write.
 * Returns { ok: true, wrrId } on success.
 */
export async function createWrr(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CreateWrrActionResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // 2. Input validation (before any DB write)
  const validation = validateCreateWrr(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const data = validation.data;
  const userId = perm.context.userId;

  // 3. Generate WRR number
  const wrrNumber = generateWrrNumber();

  // 4. Stage the header and every expected line in one RLS-claimed
  // transaction. A WRR without its line records can never safely reach the
  // confirmation command.
  let rlsResult;
  try {
    rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
      const db = tx.db as DbLike;

      const [inserted] = await db
        .insert(wrrDocuments)
        .values({
          // Reuses the client-generated id (see CreateWrrInput's doc comment
          // in lib/receiving/wrr-schema.ts) when a CIPL file was uploaded
          // before this row existed, so the file's Storage path and this
          // row's id agree. `undefined` (no CIPL attached) falls through to
          // the column's defaultRandom(), unchanged from before.
          id: data.id,
          wrrNumber,
          vendorPartyId: data.vendorPartyId,
          flowType: data.flowType,
          status: "staged_pending_arrival",
          stagedByUserId: userId,
          commercialInvoiceNo: data.commercialInvoiceNo ?? null,
          ciplFileUrl: data.ciplFileUrl ?? null,
          pezaNumber: data.pezaNumber ?? null,
          ipNumber: data.ipNumber ?? null,
          mawbMblNumber: data.mawbMblNumber ?? null,
        })
        .returning({ id: wrrDocuments.id });

      // A line's itemCode is a free-text field on the create-WRR form — it is
      // never checked against the items catalog at entry time. Without this
      // resolution step, wrr_items.item_id stays permanently null even when
      // an item with a matching code/barcode is already enrolled, and every
      // floor scan against that line is rejected as unknown_item
      // (scan-matcher.ts requires a non-null itemId to accept a match).
      // Skip the lookup when the caller already supplied itemId directly.
      const resolvedLines = await Promise.all(
        data.lines.map(async (line) => {
          if (line.itemId || !line.itemCode) return line;
          const catalogMatches = await db
            .select({ id: itemCatalog.id })
            .from(itemCatalog)
            .where(
              or(
                eq(itemCatalog.code, line.itemCode),
                eq(itemCatalog.supplierItemCode, line.itemCode),
                eq(itemCatalog.dsgcItemNumber, line.itemCode),
                eq(itemCatalog.barcode, line.itemCode),
              ),
            )
            .limit(1);
          return catalogMatches.length === 1
            ? { ...line, itemId: catalogMatches[0].id as string }
            : line;
        }),
      );

      await db.insert(wrrItems).values(
        resolvedLines.map((line) => ({
          wrrId: inserted.id,
          itemId: line.itemId ?? null,
          itemCode: line.itemCode ?? null,
          customerItemCode: line.customerItemCode ?? null,
          lotNumber: line.lotNumber,
          manufactureDate: line.manufactureDate ?? null,
          remarks: line.remarks ?? null,
          expectedQty: line.expectedQty,
          unitCbm: String(line.unitCbm),
          uom: line.uom,
          disposition: line.disposition,
          putawayLocationId: line.putawayLocationId ?? null,
        })),
      );

      return { ok: true, wrrId: inserted.id } satisfies CreateWrrActionResult;
    });
  } catch (error) {
    // Database constraints (for example, a vendor deactivated in another
    // session) must not escape a Server Action and render Next's generic
    // application-error page. Keep the detailed error server-side while
    // returning a recovery path to the operator.
    console.error("Unable to create WRR", error);
    return {
      ok: false,
      errors: [
        "Unable to create the WRR. Confirm the selected vendor is active and try again.",
      ],
    };
  }

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

/**
 * Cancels a pre-receiving WRR instead of hard-deleting it. WRRs are audit
 * documents: once created, their reference and any partial physical work
 * must remain traceable. A staged WRR is therefore safely removed from the
 * active queue by transitioning it to `cancelled`.
 */
export async function cancelWrr(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CancelWrrResult> {
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") return { ok: false, errors: ["forbidden"] };

  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const updated = await db
      .update(wrrDocuments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(wrrDocuments.id, wrrId),
        or(
          eq(wrrDocuments.status, "staged_pending_arrival"),
          eq(wrrDocuments.status, "receiving_in_progress"),
        ),
      ))
      .returning({ id: wrrDocuments.id });
    return updated.length === 1
      ? { ok: true } satisfies CancelWrrResult
      : { ok: false, errors: ["This WRR can no longer be cancelled."] } satisfies CancelWrrResult;
  });
  return result.kind === "unauthenticated" ? { ok: false, errors: ["forbidden"] } : result.value;
}

/** Updates a staged WRR header. Expected lines are deliberately locked once
 * receiving begins; editing them would invalidate generated scan labels. */
export async function updateWrrHeader(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  input: { vendorPartyId: string; flowType: "vmi" | "trading" | "supplies"; commercialInvoiceNo?: string | null; ipNumber?: string | null; mawbMblNumber?: string | null },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<UpdateWrrResult> {
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") return { ok: false, errors: ["forbidden"] };
  if (!input.vendorPartyId || !["vmi", "trading", "supplies"].includes(input.flowType)) {
    return { ok: false, errors: ["Enter a valid organization and inventory model."] };
  }
  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const updated = await db.update(wrrDocuments).set({
      vendorPartyId: input.vendorPartyId,
      flowType: input.flowType,
      commercialInvoiceNo: input.commercialInvoiceNo ?? null,
      ipNumber: input.ipNumber ?? null,
      mawbMblNumber: input.mawbMblNumber ?? null,
      updatedAt: new Date(),
    }).where(and(eq(wrrDocuments.id, wrrId), eq(wrrDocuments.status, "staged_pending_arrival"))).returning({ id: wrrDocuments.id });
    return updated.length === 1 ? { ok: true } satisfies UpdateWrrResult : { ok: false, errors: ["Only staged WRRs can be edited."] } satisfies UpdateWrrResult;
  });
  return result.kind === "unauthenticated" ? { ok: false, errors: ["forbidden"] } : result.value;
}

/** Updates expected-line document values only while the WRR remains staged. */
export async function updateWrrLines(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  lines: UpdateWrrLineInput[],
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<UpdateWrrResult> {
  const permission = await requirePermission(resolver, "receiving.confirm");
  if (permission.kind !== "authorized") return { ok: false, errors: ["forbidden"] };
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, errors: ["At least one expected line is required."] };
  for (const line of lines) {
    if (!line.id || !line.lotNumber.trim() || !line.uom.trim() || line.expectedQty <= 0 || line.unitCbm <= 0) {
      return { ok: false, errors: ["Each expected line needs a lot, quantity, UOM, and unit CBM."] };
    }
    if (line.manufactureDate && !/^\d{4}-\d{2}-\d{2}$/.test(line.manufactureDate)) {
      return { ok: false, errors: ["Manufacturing dates must use YYYY-MM-DD."] };
    }
  }

  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const database = tx.db as DbLike;
    const documents = await database.select({ status: wrrDocuments.status }).from(wrrDocuments).where(eq(wrrDocuments.id, wrrId));
    if (documents.length !== 1 || documents[0].status !== "staged_pending_arrival") {
      return { ok: false, errors: ["Expected lines can only be edited while the WRR is staged."] } satisfies UpdateWrrResult;
    }
    for (const line of lines) {
      const changed = await database.update(wrrItems).set({
        lotNumber: line.lotNumber.trim(), expectedQty: line.expectedQty, unitCbm: String(line.unitCbm), uom: line.uom.trim(),
        itemCode: line.itemCode?.trim() || null, customerItemCode: line.customerItemCode?.trim() || null,
        manufactureDate: line.manufactureDate || null, remarks: line.remarks?.trim() || null,
      }).where(and(eq(wrrItems.id, line.id), eq(wrrItems.wrrId, wrrId))).returning({ id: wrrItems.id });
      if (changed.length !== 1) return { ok: false, errors: ["One or more expected lines no longer belong to this WRR."] } satisfies UpdateWrrResult;
    }
    return { ok: true } satisfies UpdateWrrResult;
  });
  return result.kind === "unauthenticated" ? { ok: false, errors: ["forbidden"] } : result.value;
}

/**
 * Marks an unscanned receiving line for normal storage or inbound inspection.
 * Inspection is selected before physical reconciliation so the floor flow can
 * require an inspection location and commit the line as quarantined stock.
 */
export async function setWrrLineDisposition(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  wrrItemId: string,
  disposition: "store" | "inspect",
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<SetWrrLineDispositionResult> {
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") return { ok: false, errors: ["forbidden"] };
  if (!wrrId || !wrrItemId || !["store", "inspect"].includes(disposition)) {
    return { ok: false, errors: ["Choose a valid receiving disposition."] };
  }

  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const database = tx.db as DbLike;
    const updated = await database
      .update(wrrItems)
      .set({ disposition })
      .where(and(
        eq(wrrItems.id, wrrItemId),
        eq(wrrItems.wrrId, wrrId),
        eq(wrrItems.scannedQty, 0),
        isNull(wrrItems.committedAt),
      ))
      .returning({ id: wrrItems.id });

    return updated.length === 1
      ? { ok: true } satisfies SetWrrLineDispositionResult
      : { ok: false, errors: ["Only an unscanned line can be changed. Start a new WRR line for goods already scanned."] } satisfies SetWrrLineDispositionResult;
  });

  return result.kind === "unauthenticated"
    ? { ok: false, errors: ["forbidden"] }
    : result.value;
}

// ---------------------------------------------------------------------------
// uploadCiplFile / getCiplSignedUrl
// ---------------------------------------------------------------------------
//
// specs/04-services-and-infrastructure/design.md §10 (Supabase Storage
// design) — bucket `cipl-documents`, path
// `cipl/{wrr_id}/{upload_uuid}/{sanitized-filename}`, private with signed
// URLs generated only after authorizing access (§10.2/§10.3).
//
// The WRR row does not exist yet when a CIPL is attached on the create-WRR
// form — the caller generates `wrrId` client-side (crypto.randomUUID()) and
// createWrr above reuses that same id (CreateWrrInput.id) so the uploaded
// object's path and the eventual row agree without a second write.

export type UploadCiplFileResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Uploads a CIPL/packing-list reference file to the private `cipl-documents`
 * bucket. Requires receiving.confirm — the same capability createWrr itself
 * requires, and the one the bucket's own INSERT policy checks
 * (0030_cipl_documents_storage.sql), so this call and the eventual createWrr
 * call are gated identically.
 */
export async function uploadCiplFile(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  file: File,
): Promise<UploadCiplFileResult> {
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "forbidden" };
  }

  const validation = validateCiplFile(file);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const path = buildCiplObjectPath(wrrId, randomUUID(), file.name);

  const storage = await getStorageClient();
  const { error } = await storage
    .from("cipl-documents")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    console.error("CIPL upload failed", error);
    return { ok: false, error: "Upload failed. Please try again." };
  }

  return { ok: true, path };
}

export type CiplSignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Generates a short-lived (design.md §10.2: "Signed URLs are short-lived
 * (<= 60 minutes)") signed URL for viewing an already-uploaded CIPL file.
 * Requires receiving.view — matches the WRR detail page's own gate and the
 * bucket's SELECT policy.
 */
export async function getCiplSignedUrl(
  resolver: RequestAuthorizationResolver,
  objectPath: string,
): Promise<CiplSignedUrlResult> {
  const perm = await requirePermission(resolver, "receiving.view");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "forbidden" };
  }

  const storage = await getStorageClient();
  const { data, error } = await storage
    .from("cipl-documents")
    .createSignedUrl(objectPath, 60 * 60); // 60 minutes — the spec's stated ceiling

  if (error || !data) {
    console.error("CIPL signed URL generation failed", error);
    return { ok: false, error: "Unable to generate a document link." };
  }

  return { ok: true, url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// recordScan
// ---------------------------------------------------------------------------

// Cheaply peeks at whether `barcode` parses as a wrr_item_unit JSON payload
// (Spec 18 §2.2), returning its wrr_item_id when so. Deliberately narrow/
// duplicated from scan-matcher.ts's own parsing rather than exported from
// there: matchScan stays a pure function with no DB access, while this
// action is the one place that needs to know *whether to query at all*
// before calling it — an ordinary (non-JSON) barcode must never trigger a
// wrr_item_unit_scans lookup.
function peekWrrItemUnitId(barcode: string): string | null {
  const trimmed = barcode.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown; wrr_item_id?: unknown };
    if (parsed?.type === "wrr_item_unit" && typeof parsed?.wrr_item_id === "string") {
      return parsed.wrr_item_id;
    }
  } catch {
    // Not valid JSON — not a wrr_item_unit payload.
  }
  return null;
}

/**
 * Records a single barcode scan against a receiving_in_progress WRR.
 * Requires receiving.scan capability.
 * Returns remainingQty and disposition on success.
 *
 * Amended 2026-08-20 (design.md §6.2/§9), STORE lines only: does NOT write
 * wrr_items.scanned_qty for a store-disposition line — that column now
 * means "units committed so far" for that disposition and is written
 * exclusively by commitWrrLine's per-unit commit. INSPECT-disposition lines
 * are unaffected by that amendment (design.md §6.3): recordScan still
 * increments wrr_items.scanned_qty for them exactly as before, since
 * commitInspectLine remains a whole-line commit gated on
 * `scanned_qty >= expected_qty` with no other writer of that column. This
 * action still performs the WRR-document-QR check, matchScan matching, and
 * the per-unit duplicate-label (wrr_item_unit_scans) write, all unchanged.
 */
export async function recordScan(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  barcode: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<RecordScanResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.scan");
  if (perm.kind !== "authorized") {
    return { ok: false, reason: "forbidden" };
  }
  const userId = perm.context.userId;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // 2. Fetch WRR with items
    const doc = await fetchWrrForAction(db, wrrId);
    if (doc === null) {
      return { ok: false, reason: "not_found" } satisfies RecordScanResult;
    }

    // 3. Status guard
    if (doc.status !== "receiving_in_progress") {
      return { ok: false, reason: "invalid_status" } satisfies RecordScanResult;
    }

    // The QR printed in the WRR header contains the document number. It is a
    // document identifier, not a physical unit label, so reject it with an
    // actionable explanation instead of the misleading "unknown item" state.
    if (barcode.trim() === doc.wrrNumber) {
      return { ok: false, reason: "wrr_document_qr" } satisfies RecordScanResult;
    }

    // 3a. Per-unit duplicate detection (Spec 18 §2.2): only when the barcode
    // itself parses as a wrr_item_unit payload do we even query
    // wrr_item_unit_scans — an ordinary barcode never triggers this lookup.
    let alreadyScannedUnitIds: Set<string> | undefined;
    const peekedWrrItemId = peekWrrItemUnitId(barcode);
    if (peekedWrrItemId !== null) {
      const unitScanRows = (await db
        .select({ unitId: wrrItemUnitScans.unitId })
        .from(wrrItemUnitScans)
        .where(eq(wrrItemUnitScans.wrrItemId, peekedWrrItemId))) as Array<{ unitId: string }>;
      alreadyScannedUnitIds = new Set(unitScanRows.map((row) => row.unitId));
    }

    // 4. Match barcode against expected lines
    const matchResult = matchScan(barcode, doc.items, undefined, alreadyScannedUnitIds);
    if (!matchResult.matched) {
      return { ok: false, reason: matchResult.reason } satisfies RecordScanResult;
    }

    const line = matchResult.line;

    // 5. Increment scannedQty. Every accepted QR represents exactly one
    // physical pallet or unit.
    await db
      .update(wrrItems)
      .set({ scannedQty: line.scannedQty + matchResult.scanQty })
      .where(eq(wrrItems.id, line.id));

    // 5a. Persist the per-unit scan record for a successful wrr_item_unit
    // match, in the same transaction as the scannedQty increment above —
    // both succeed or both roll back together.
    if (matchResult.unitIds) {
      await db.insert(wrrItemUnitScans).values(matchResult.unitIds.map((unitId) => ({
        wrrItemId: line.id,
        unitId,
        scannedByUserId: userId,
      })));
    } else if (matchResult.unitId) {
      await db.insert(wrrItemUnitScans).values({
        wrrItemId: line.id,
        unitId: matchResult.unitId,
        scannedByUserId: userId,
      });
    }

    // 6. Return success
    return {
      ok: true,
      remainingQty: matchResult.remainingQty,
      disposition: line.disposition,
    } satisfies RecordScanResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, reason: "forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// startReceiving
// ---------------------------------------------------------------------------

/**
 * Transitions a WRR from staged_pending_arrival → receiving_in_progress.
 * Requires receiving.confirm capability.
 * Rejects if the WRR is already in progress, confirmed, or cancelled.
 */
export async function startReceiving(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // 2. Fetch WRR
    const doc = await fetchWrrForAction(db, wrrId);
    if (doc === null) {
      return { ok: false as const, errors: ["not_found"] };
    }

    // 3. Status guard — only staged_pending_arrival may transition to in_progress
    if (doc.status !== "staged_pending_arrival") {
      return { ok: false as const, errors: ["invalid_status"] };
    }

    // 4. Transition status
    await db
      .update(wrrDocuments)
      .set({ status: "receiving_in_progress", updatedAt: new Date() })
      .where(eq(wrrDocuments.id, wrrId));

    return { ok: true as const };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// commitWrrLine
// ---------------------------------------------------------------------------

/** Resolves a candidate commit location's active/type shape for
 * validateLineCommit. Shared by both the per-unit store path and the
 * per-line inspect path. */
async function resolveCommitLocation(
  tx: DbLike,
  locationId: string,
): Promise<CommitLocation | null> {
  const locationRows = await tx
    .select({
      id: locations.id,
      isActive: locations.isActive,
      locationType: locations.locationType,
    })
    .from(locations)
    .where(eq(locations.id, locationId));
  return locationRows.length === 1
    ? {
        id: locationRows[0].id as string,
        isActive: locationRows[0].isActive as boolean,
        locationType: locationRows[0].locationType as string,
      }
    : null;
}

/** Re-evaluates WRR-level completion: flips to 'confirmed' only once every
 * line on the WRR has committed_at set. Left as receiving_in_progress
 * otherwise (no intermediate status value is introduced). Shared by both
 * the per-unit store path (called only once a line reaches its terminal
 * unit) and the per-line inspect path (called after every commit attempt,
 * unchanged from 2026-08-10). */
async function reevaluateWrrCompletion(
  tx: DbLike,
  wrrId: string,
  userId: string,
): Promise<void> {
  const allLines = await tx
    .select({ id: wrrItems.id, committedAt: wrrItems.committedAt })
    .from(wrrItems)
    .where(eq(wrrItems.wrrId, wrrId));
  const allCommitted =
    allLines.length > 0 &&
    allLines.every((l: { committedAt: Date | null }) => l.committedAt !== null);

  if (allCommitted) {
    await tx
      .update(wrrDocuments)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(wrrDocuments.id, wrrId),
        eq(wrrDocuments.status, "receiving_in_progress"),
      ));
  }
}


/**
 * Commits a WRR line's receipt — the whole declared quantity in one call,
 * per fix-it-felix's batch-receiving model (2026-08-24, supersedes the
 * per-physical-unit scan-suggest-commit loop this file previously
 * implemented for the 2026-08-20 amendment; see
 * specs/00-steering/revision-log.md for the reconciliation).
 *
 * Two placement shapes are accepted:
 * - Single location: `params.locationId` — the whole line goes to one place.
 * - Batch split: `params.allocations` (explicit per-location quantities) or
 *   `params.unitLocationIds` (one location per physical box, index-aligned
 *   with the line's expected quantity — derives `allocations` by grouping).
 *   A batch commit requires `params.presenceAttested === true` (the floor
 *   operator confirms every declared box/pallet is physically present
 *   before storing) and the allocation total must equal the line's
 *   expected quantity exactly.
 *
 * Idempotent via the same `wrr_items.committed_at IS NULL` conditional
 * claim this file has always used for whole-line commits — a retried call
 * against an already-committed line observes the prior success rather than
 * re-posting inventory.
 *
 * Also posts one durable `inventory_units` row per physical box (derived,
 * stable id via `deriveWrrUnitId`) so later outbound picking can select
 * exact registered boxes rather than only an aggregate quantity.
 *
 * Requires receiving.confirm capability.
 */
export async function commitWrrLine(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  wrrItemId: string,
  params: {
    locationId?: string;
    allocations?: Array<{ locationId: string; qty: number }>;
    unitLocationIds?: string[];
    presenceAttested?: boolean;
  },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CommitWrrLineResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const userId = perm.context.userId;

  // Every read, validation, conditional claim, and inventory write for this
  // one line occurs through one RLS-claimed transaction. The conditional
  // UPDATE on committed_at IS NULL is the idempotency gate: only the
  // transaction that can claim the null-to-timestamp transition may create
  // this line's inventory rows; retries observe the existing successful
  // result instead.
  let rlsResult: import("@/lib/db/rls-transaction").RlsTransactionResult<CommitWrrLineResult>;
  try {
    rlsResult = await withRlsTransaction(rlsDeps, async (rlsTx) => {
      const tx = rlsTx.db as DbLike;
      const doc = await fetchWrrForAction(tx, wrrId);
      if (doc === null) {
        return { ok: false, errors: ["not_found"] } satisfies CommitWrrLineResult;
      }

      const line = doc.items.find((item) => item.id === wrrItemId);
      if (!line) {
        return { ok: false, errors: ["not_found"] } satisfies CommitWrrLineResult;
      }

      // Idempotency short-circuit (R7.5): once a line has committed, its own
      // committed_at is authoritative on its own, independent of the WRR's
      // current status (which may have already advanced to 'confirmed' once
      // every line committed). Re-validating against the now-'confirmed' WRR
      // status would incorrectly reject an already-successful retry.
      const existingRows = await tx
        .select({ committedAt: wrrItems.committedAt })
        .from(wrrItems)
        .where(eq(wrrItems.id, wrrItemId));
      if (existingRows.length === 1 && existingRows[0].committedAt !== null) {
        return { ok: true } satisfies CommitWrrLineResult;
      }

      let batchAllocations = params.allocations?.filter((allocation) =>
        typeof allocation.locationId === "string" && Number.isInteger(allocation.qty) && allocation.qty > 0,
      ) ?? [];
      const requestedUnitLocations = params.unitLocationIds?.filter(
        (locationId) => typeof locationId === "string" && locationId.length > 0,
      );
      if (requestedUnitLocations && requestedUnitLocations.length !== line.expectedQty) {
        return { ok: false, errors: ["unit_location_count_mismatch"] } satisfies CommitWrrLineResult;
      }
      if (requestedUnitLocations) {
        const grouped = requestedUnitLocations.reduce<Record<string, number>>((result, locationId) => {
          result[locationId] = (result[locationId] ?? 0) + 1;
          return result;
        }, {});
        batchAllocations = Object.entries(grouped).map(([locationId, qty]) => ({ locationId, qty }));
      }
      const isBatch = batchAllocations.length > 0;
      if (isBatch && !params.presenceAttested) {
        return { ok: false, errors: ["presence_attestation_required"] } satisfies CommitWrrLineResult;
      }
      if (isBatch && batchAllocations.reduce((sum, allocation) => sum + allocation.qty, 0) !== line.expectedQty) {
        return { ok: false, errors: ["allocation_qty_must_equal_expected"] } satisfies CommitWrrLineResult;
      }

      const targetLocationIds = isBatch
        ? batchAllocations.map((allocation) => allocation.locationId)
        : params.locationId ? [params.locationId] : [];
      if (targetLocationIds.length === 0) {
        return { ok: false, errors: ["missing_location"] } satisfies CommitWrrLineResult;
      }

      const locationRows = await tx
        .select({
          id: locations.id,
          isActive: locations.isActive,
          locationType: locations.locationType,
        })
        .from(locations)
        .where(or(...targetLocationIds.map((id) => eq(locations.id, id))));
      const normalizedLocationRows = locationRows as Array<{ id: string; isActive: boolean; locationType: string }>;
      const locationsById = new Map(normalizedLocationRows.map((row) => [row.id, row]));
      const validationLine = isBatch ? { ...line, scannedQty: line.expectedQty } : line;
      for (const targetLocationId of targetLocationIds) {
        const row = locationsById.get(targetLocationId);
        const location: CommitLocation | null = row
          ? { id: row.id, isActive: row.isActive, locationType: row.locationType }
          : null;
        const validation = validateLineCommit(
          { id: doc.id, status: doc.status, flowType: doc.flowType, vendorPartyId: doc.vendorPartyId },
          validationLine,
          location,
        );
        if (!validation.ok) {
          return { ok: false, errors: validation.errors } satisfies CommitWrrLineResult;
        }
      }

      // Conditional claim: only the caller who flips committed_at from NULL to
      // now() may post this line's inventory rows below.
      const claimed = await tx
        .update(wrrItems)
        .set({
          committedAt: new Date(),
          ...(line.disposition === "store" && !isBatch ? { putawayLocationId: targetLocationIds[0] } : {}),
          ...(isBatch ? { scannedQty: line.expectedQty } : {}),
        })
        .where(and(eq(wrrItems.id, wrrItemId), isNull(wrrItems.committedAt)))
        .returning({ id: wrrItems.id });

      if (claimed.length === 1) {
        const [lot] = await tx
          .insert(lots)
          .values({
            lotNumber: line.lotNumber,
            wrrItemId: line.id,
            itemId: line.itemId!,
            flowType: doc.flowType as "vmi" | "trading" | "supplies",
            ownerPartyId: doc.flowType === "vmi" ? doc.vendorPartyId : null,
            status: line.disposition === "store" ? "available" : "quarantined",
            pezaNumber: doc.pezaNumber,
            commercialInvoiceNo: doc.commercialInvoiceNo,
            ipNumber: doc.ipNumber,
            manufactureDate: line.manufactureDate,
          })
          .returning({ id: lots.id });

        const committedAllocations = isBatch
          ? batchAllocations
          : [{ locationId: targetLocationIds[0], qty: line.scannedQty }];
        const committedUnitLocations = requestedUnitLocations
          ?? (isBatch
            ? committedAllocations.flatMap((allocation) =>
                Array.from({ length: allocation.qty }, () => allocation.locationId),
              )
            : Array.from({ length: line.expectedQty }, () => targetLocationIds[0]));

        if (isBatch && line.disposition === "store") {
          await tx.insert(wrrItemPutawayAllocations).values(
            committedAllocations.map((allocation) => ({
              wrrItemId: line.id,
              locationId: allocation.locationId,
              qty: allocation.qty,
              createdByUserId: userId,
            })),
          );
        }

        await tx.insert(lotLocationBalances).values(committedAllocations.map((allocation) => ({
          lotId: lot.id,
          locationId: allocation.locationId,
          qtyReceived: allocation.qty,
          qtyRemaining: allocation.qty,
          qtyCommitted: 0,
        })));

        await tx.insert(inventoryUnits).values(
          committedUnitLocations.map((locationId, index) => {
            const unitId = deriveWrrUnitId(line.id, index + 1);
            return {
              unitId,
              cartonId: cartonIdFromUnitId(unitId),
              unitIndex: index + 1,
              wrrItemId: line.id,
              lotId: lot.id,
              locationId,
              status: line.disposition === "store" ? "available" : "quarantined",
            };
          }),
        );

        await tx.insert(inventoryTransactions).values(committedAllocations.map((allocation) => ({
          // A WRR item UUID is globally unique and keeps the receipt reference
          // below the schema's 50-character limit, unlike concatenating two
          // full UUIDs. It also makes a retried commit deterministically refer
          // to the same physical line.
          transactionNumber: `RCV-${line.id.slice(0, 8)}-${allocation.locationId.slice(0, 8)}`,
          lotId: lot.id,
          itemId: line.itemId!,
          movementType: "receiving",
          toLocationId: allocation.locationId,
          qty: allocation.qty,
          flowType: doc.flowType as "vmi" | "trading" | "supplies",
          commercialInvoiceNo: doc.commercialInvoiceNo,
          wrrId: doc.id,
          performedByUserId: userId,
        })));

        // An inspect-disposition receipt is not complete when the lot is merely
        // quarantined. It must also open the shared inbound inspection case that
        // drives Master Inventory's Inspection tab and the subsequent resolution
        // workflow. Keeping this in the same transaction means a successfully
        // committed held lot can never be stranded without an inspection task.
        if (line.disposition === "inspect") {
          await tx.insert(inspectionCases).values({
            contextType: "inbound",
            sourceRefType: "wrr_item",
            sourceRefId: line.id,
            lotId: lot.id,
            itemId: line.itemId!,
            partyId: doc.vendorPartyId,
            flowType: doc.flowType as "vmi" | "trading" | "supplies",
            status: "open",
            openedBy: userId,
          });
        }
      }
      // If claimed.length === 0, this line was already committed by a prior
      // call — idempotent retry; nothing more to post for this line.

      // Re-evaluate WRR-level completion: flip to 'confirmed' only once every
      // line on this WRR has committed_at set. Left as receiving_in_progress
      // otherwise (no intermediate status value is introduced).
      await reevaluateWrrCompletion(tx, wrrId, userId);

      return { ok: true } satisfies CommitWrrLineResult;
    });
  } catch (error) {
    // A failed insert/constraint/RLS check must not strand a warehouse worker
    // on Next's generic application-error page. Keep the actual database
    // error in server logs and return the operator to the receive screen with
    // a recoverable result; the surrounding transaction has already rolled
    // back, so no partial receipt is created.
    console.error("Unable to commit receiving line", {
      wrrId,
      wrrItemId,
      error,
    });
    return { ok: false, errors: ["commit_failed"] };
  }

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

export async function uploadAndParseCiplDocument(
  wrrId: string,
  formData: FormData,
) {
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return { ok: false, error: "No file was uploaded." };
  }

  const validation = validateCiplFile({ type: file.type, size: file.size });
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Dynamic import of cipl-parser
    const { parseCiplDocument } = await import("@/lib/parsers/cipl-parser");
    const parseResult = await parseCiplDocument(buffer, file.name);

    let storagePath: string | null = null;
    try {
      const storageClient = await getStorageClient();
      const objectPath = buildCiplObjectPath(wrrId, randomUUID(), file.name);
      const { error } = await storageClient
        .from("cipl-documents")
        .upload(objectPath, buffer, { contentType: file.type, upsert: true });

      if (!error) {
        storagePath = objectPath;
      }
    } catch {
      // Storage upload optional/graceful fallback if bucket not present in local dev
    }

    return {
      ok: true,
      path: storagePath,
      parseResult,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Document processing error: ${errorMsg}`,
    };
  }
}

export async function closeWrrWithShortage(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  shortageReason?: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<{ ok: boolean; error?: string }> {
  const permResult = await requirePermission(resolver, "receiving.confirm");
  if (permResult.kind !== "authorized") {
    return { ok: false, error: "forbidden" };
  }

  const userId = permResult.context.userId;

  try {
    const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
      const db = tx.db as DbLike;
      const existing = await db
        .select({ id: wrrDocuments.id, status: wrrDocuments.status })
        .from(wrrDocuments)
        .where(eq(wrrDocuments.id, wrrId))
        .limit(1);

      if (existing.length === 0) {
        return { ok: false, error: "not_found" };
      }

      if (existing[0].status === "confirmed") {
        return { ok: true };
      }

      await db
        .update(wrrDocuments)
        .set({
          status: "confirmed",
          updatedAt: new Date(),
        })
        .where(eq(wrrDocuments.id, wrrId));

      return { ok: true };
    });

    if (rlsResult.kind === "unauthenticated") {
      return { ok: false, error: "forbidden" };
    }
    return rlsResult.value;
  } catch (err) {
    console.error("Failed to close WRR with shortage:", err);
    return { ok: false, error: "Failed to close WRR with shortage" };
  }
}


