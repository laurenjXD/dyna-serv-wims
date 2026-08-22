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
import { wrrDocuments, wrrItems, wrrItemUnitScans } from "@/lib/db/schema/wrr";
import { items as itemCatalog } from "@/lib/db/schema/items";
import { lots } from "@/lib/db/schema/lots";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { locations } from "@/lib/db/schema/locations";
import { inspectionCases } from "@/lib/db/schema/transfers";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { getStorageClient } from "@/lib/supabase/storage";
import { validateCiplFile, buildCiplObjectPath } from "@/lib/receiving/cipl-upload";
import { randomUUID, createHash } from "node:crypto";

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
  // Optional: only the real Drizzle `PostgresJsDatabase` (lib/db/rls-pool.ts)
  // provides this — used exclusively by commitStoreUnit's SAVEPOINT-based
  // concurrency recovery below. Hand-rolled unit-test doubles never
  // implement it, and commitStoreUnit feature-detects its absence to fall
  // back to un-savepointed writes rather than requiring every test double in
  // the codebase to grow a raw SQL escape hatch it never exercises.
  execute?: (query: unknown) => Promise<unknown>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// True only for the exact Postgres unique-violation (23505) on
// inventory_transactions' own transaction_number uniqueness constraint —
// commitStoreUnit's genuine-concurrency recovery path (see writeUnit's
// SAVEPOINT wrapping below) must never treat any OTHER error, including a
// unique-violation on some unrelated constraint, as this specific
// "someone else already committed this exact unit" condition.
//
// Fixed 2026-08-21 (db-migration-verifier, Bug A): Drizzle's postgres-js
// driver wraps every real driver error in a DrizzleQueryError — the actual
// Postgres error (carrying the real `.code`/`.constraint_name`) lives on
// `error.cause`, not on the caught error itself. Checking only the
// top-level error meant this function always returned false against a real
// concurrent unique-violation, so the SAVEPOINT recovery below never
// triggered and the raw Postgres error propagated as an unhandled
// rejection — exactly the failure this mechanism exists to prevent. Both
// shapes are checked now (top-level first, then `.cause`), since some call
// sites/driver versions may not wrap at all.
function isUnitCommitConflict(error: unknown): boolean {
  const matchesShape = (candidate: unknown): boolean => {
    const e = candidate as { code?: unknown; constraint_name?: unknown } | null | undefined;
    return (
      e != null &&
      typeof e === "object" &&
      e.code === "23505" &&
      e.constraint_name === "inventory_transactions_transaction_number_unique"
    );
  };
  if (matchesShape(error)) return true;
  const cause = (error as { cause?: unknown } | null | undefined)?.cause;
  return matchesShape(cause);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CreateWrrActionResult =
  | { ok: true; wrrId: string }
  | { ok: false; errors: string[] };

export type RecordScanResult =
  | { ok: true; wrrItemId: string; remainingQty: number; disposition: "store" | "inspect" }
  | { ok: false; reason: string };

export type CommitWrrLineResult = { ok: true } | { ok: false; errors: string[] };
export type CancelWrrResult = { ok: true } | { ok: false; errors: string[] };
export type UpdateWrrResult = { ok: true } | { ok: false; errors: string[] };

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

    // Amended 2026-08-20 (design.md §6.2/§9's per-unit re-scoping) — STORE
    // lines only: recordScan no longer increments wrr_items.scanned_qty for
    // a store-disposition line. scanned_qty now means "units committed so
    // far" for that disposition, and the sole writer of that column for a
    // store line is commitWrrLine's per-unit commit.
    //
    // INSPECT-disposition lines are UNCHANGED by that amendment (design.md
    // §6.3): they are still committed as one whole line via
    // commitInspectLine, gated on `scanned_qty >= expected_qty`, and
    // commitInspectLine has never written wrr_items.scanned_qty itself —
    // that has always been recordScan's job for inspect lines. So the write
    // below is conditional on disposition, not removed outright.
    if (line.disposition === "inspect") {
      await db
        .update(wrrItems)
        .set({ scannedQty: line.scannedQty + matchResult.scanQty })
        .where(eq(wrrItems.id, line.id));
    }

    // 5a. Persist the per-unit scan record for a successful wrr_item_unit
    // match (Spec 18 §2.2, unchanged) — this is the only wrr_item_unit_scans
    // write in this action and is independent of the (now removed)
    // scanned_qty increment.
    if (matchResult.unitId) {
      await db.insert(wrrItemUnitScans).values({
        wrrItemId: line.id,
        unitId: matchResult.unitId,
        scannedByUserId: userId,
      });
    }

    // 6. Return success. wrrItemId lets the caller (the floor scan page) show
    // this specific line's Store/Hold form next — scanned_qty no longer
    // changes at scan time, so there is no other durable signal for "which
    // line was just matched" to carry through the redirect.
    return {
      ok: true,
      wrrItemId: line.id,
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

/** Deterministic, length-safe (schema's 50-char transaction_number limit)
 * identifier for one unit-commit event, derived from the line and the
 * caller-supplied idempotencyKey. Doubles as both this unit-commit's
 * inventory_transactions.transaction_number value and the lookup key used
 * to detect a retried request before any write — no new table/column is
 * introduced for this (design.md §9's own note that the storage mechanism
 * is an implementation-level detail). A UUID wrr_item_id concatenated
 * directly with an arbitrary-length caller idempotencyKey could exceed the
 * column's 50-character limit, so both are hashed together instead. */
function unitCommitTransactionNumber(wrrItemId: string, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`${wrrItemId}:${idempotencyKey}`).digest("hex");
  return `RCV-${digest.slice(0, 40)}`;
}

/**
 * Commits ONE physical unit of a `store`-disposition line (design.md §9,
 * amended 2026-08-20). On the line's first committed unit, creates the lot
 * (status 'available'); on every subsequent unit, reuses it (resolved via
 * wrr_item_id). For the chosen location, creates a new lot_location_balances
 * row (qty=1) or increments an existing one by 1 (§9 step 4 / §6.2b's
 * multi-location split). Inserts one inventory_transactions row (qty=1).
 * Increments wrr_items.scanned_qty (now "units committed so far") by 1 and
 * sets committed_at only once that count reaches expected_qty.
 *
 * Per-unit idempotency (R7.5, re-scoped 2026-08-20): scoped to
 * params.idempotencyKey, which is REQUIRED for a store line — NOT to
 * committed_at, which now marks only the line's terminal completion.
 */
async function commitStoreUnit(
  tx: DbLike,
  doc: { id: string; status: string; flowType: string; vendorPartyId: string; pezaNumber: string | null; commercialInvoiceNo: string | null; ipNumber: string | null },
  line: WrrLine,
  params: { locationId: string; idempotencyKey?: string },
  userId: string,
): Promise<CommitWrrLineResult> {
  if (!params.idempotencyKey || params.idempotencyKey.trim() === "") {
    return {
      ok: false,
      errors: [
        "idempotencyKey is required for a store-disposition unit commit (design.md §9, R7.5)",
      ],
    };
  }

  // Real Postgres-backed Drizzle client only (see DbLike's own doc comment
  // above): used below for (1) the row lock that serializes every
  // concurrent commit — identical AND distinct idempotencyKey — against
  // this exact WRR line, (2) the atomic scanned_qty increment, and (3) the
  // SAVEPOINT defense-in-depth kept around the lot/balance/transaction
  // write. A hand-rolled test double with no raw `.execute` skips all
  // three and runs exactly the pre-fix, un-locked/un-savepointed sequence
  // — concurrency is never exercised against those mocked call sites.
  const rawExecutor = tx as unknown as { execute?: (query: unknown) => Promise<unknown> };
  const canUseRawSql = typeof rawExecutor.execute === "function";
  const executor = rawExecutor as { execute: (query: unknown) => Promise<unknown> };

  // Row-lock this line FIRST — before the idempotency check, before the lot
  // lookup, before anything else touches it (db-migration-verifier,
  // 2026-08-20 second follow-up: Bug B). This closes TWO genuine-concurrency
  // races among DISTINCT-idempotencyKey unit-commits on the SAME line (the
  // normal multi-unit-in-flight case, not a double-submit):
  //   (a) the lot lookup below is a plain
  //       `SELECT lots WHERE wrr_item_id = line.id` followed, several
  //       statements later, by `INSERT INTO lots` — with no unique
  //       constraint on lots.wrr_item_id, several simultaneous callers can
  //       each observe "no lot yet" and each insert their own phantom lot.
  //   (b) the final wrr_items.scanned_qty update used to be computed from a
  //       stale snapshot fetched once at the top of commitWrrLine's own
  //       transaction, then written via an absolute SET — the last
  //       committing transaction silently overwrote every other racer's
  //       increment.
  // A Postgres row lock (SELECT ... FOR UPDATE) on this exact wrr_items row
  // serializes every concurrent commit attempt for this line: a second
  // caller blocks until the first transaction commits or rolls back, then
  // its own SELECT ... FOR UPDATE re-reads the row's latest COMMITTED
  // value once unblocked — closing (a) by making the lot lookup's
  // check-then-act critical section mutually exclusive per line, and
  // enabling (b) by giving the scanned_qty update below a value read AFTER
  // the lock is held, rather than the stale pre-call snapshot.
  //
  // This also makes the SAME-idempotencyKey race (the "6b" test) naturally
  // safe without ever reaching the SAVEPOINT/isUnitCommitConflict recovery
  // path below: the second caller unblocks only once the first has already
  // committed the deterministic transaction_number row, so its own
  // idempotency SELECT a few lines down finds that row and takes the
  // graceful { ok: true } early-return — it never reaches the duplicate
  // INSERT that mechanism exists to recover from. That mechanism is kept
  // below anyway as defense-in-depth (belt-and-suspenders against the
  // invariant "the lock is always acquired before any write for this line"
  // ever being violated by a future change to this function) — fixed for
  // its own, separate, already-confirmed bug (Bug A: isUnitCommitConflict
  // never actually matched a real driver error — see its own updated doc
  // comment above) rather than removed, since removing it could not be
  // re-verified against live Postgres in this change.
  let currentScannedQty = line.scannedQty;
  if (canUseRawSql) {
    const lockRows = (await executor.execute(
      sql`select scanned_qty from wrr_items where id = ${line.id} for update`,
    )) as unknown as Array<{ scanned_qty: number }>;
    if (lockRows.length === 1) {
      currentScannedQty = lockRows[0].scanned_qty;
    }
  }

  const location = await resolveCommitLocation(tx, params.locationId);

  const validation = validateLineCommit(
    { id: doc.id, status: doc.status, flowType: doc.flowType, vendorPartyId: doc.vendorPartyId },
    // Validate against the freshly-locked scannedQty, not the (possibly
    // stale, concurrently-modified-by-another-caller) snapshot
    // fetchWrrForAction captured once at the top of commitWrrLine's own
    // transaction.
    { ...line, scannedQty: currentScannedQty },
    location,
  );
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  // Per-unit idempotency lookup: a retry with the SAME idempotencyKey for
  // this SAME line must return the original authoritative outcome without
  // writing anything a second time.
  const unitTxnNumber = unitCommitTransactionNumber(line.id, params.idempotencyKey);
  const existingUnitTxn = await tx
    .select({ id: inventoryTransactions.id })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.transactionNumber, unitTxnNumber));
  if (existingUnitTxn.length === 1) {
    return { ok: true };
  }

  // The write sequence below (lot create-or-reuse, balance create-or-
  // increment, inventory_transactions insert) is wrapped in a SAVEPOINT when
  // the bound `tx` is a real Postgres-backed Drizzle client. This closes a
  // genuine-concurrency race (db-migration-verifier, 2026-08-20 follow-up):
  // two simultaneous calls with the IDENTICAL idempotencyKey can both pass
  // the SELECT-based idempotency check above before either commits, then
  // both attempt this write sequence. The loser's final INSERT into
  // inventory_transactions hits inventory_transactions_transaction_number_
  // unique (its transactionNumber is deterministic from
  // line.id+idempotencyKey, so both racers compute the identical value) —
  // a real Postgres unique-violation aborts the surrounding transaction for
  // every statement afterward unless recovered via ROLLBACK TO SAVEPOINT,
  // which this block does before returning the same graceful { ok: true }
  // a sequential retry already returns above. Any other error (or a
  // conflict on a different constraint) is re-thrown unchanged, never
  // swallowed. As explained in the row-lock comment above, this path is
  // expected to be unreachable now that the lock precedes it — kept as
  // defense-in-depth, not removed.
  const writeUnit = async (): Promise<void> => {
    // On this line's first committed unit, create the lot; on every
    // subsequent unit, reuse it (design.md §9 step 3).
    const existingLotRows = await tx
      .select({ id: lots.id })
      .from(lots)
      .where(eq(lots.wrrItemId, line.id));

    let lotId: string;
    if (existingLotRows.length === 1) {
      lotId = existingLotRows[0].id as string;
    } else {
      const [newLot] = await tx
        .insert(lots)
        .values({
          lotNumber: line.lotNumber,
          wrrItemId: line.id,
          itemId: line.itemId!,
          flowType: doc.flowType as "vmi" | "trading" | "supplies",
          ownerPartyId: doc.flowType === "vmi" ? doc.vendorPartyId : null,
          status: "available",
          pezaNumber: doc.pezaNumber,
          commercialInvoiceNo: doc.commercialInvoiceNo,
          ipNumber: doc.ipNumber,
        })
        .returning({ id: lots.id });
      lotId = newLot.id as string;
    }

    // Create-or-increment the lot_location_balances row for this unit's
    // chosen location (design.md §9 step 4 / §6.2b's multi-location split).
    const existingBalanceRows = await tx
      .select({
        id: lotLocationBalances.id,
        qtyReceived: lotLocationBalances.qtyReceived,
        qtyRemaining: lotLocationBalances.qtyRemaining,
      })
      .from(lotLocationBalances)
      .where(and(eq(lotLocationBalances.lotId, lotId), eq(lotLocationBalances.locationId, params.locationId)));

    if (existingBalanceRows.length === 1) {
      const existing = existingBalanceRows[0];
      await tx
        .update(lotLocationBalances)
        .set({
          qtyReceived: (existing.qtyReceived as number) + 1,
          qtyRemaining: (existing.qtyRemaining as number) + 1,
          updatedAt: new Date(),
        })
        .where(eq(lotLocationBalances.id, existing.id as string));
    } else {
      await tx.insert(lotLocationBalances).values({
        lotId,
        locationId: params.locationId,
        qtyReceived: 1,
        qtyRemaining: 1,
        qtyCommitted: 0,
      });
    }

    // One immutable inventory_transactions row per committed unit (qty=1).
    await tx.insert(inventoryTransactions).values({
      transactionNumber: unitTxnNumber,
      lotId,
      itemId: line.itemId!,
      movementType: "receiving",
      toLocationId: params.locationId,
      qty: 1,
      flowType: doc.flowType as "vmi" | "trading" | "supplies",
      commercialInvoiceNo: doc.commercialInvoiceNo,
      wrrId: doc.id,
      performedByUserId: userId,
    });
  };

  if (canUseRawSql) {
    await executor.execute(sql`savepoint unit_commit`);
    try {
      await writeUnit();
    } catch (error) {
      // Recover the transaction from Postgres's aborted-until-rollback state
      // before doing anything else with it — a plain try/catch around the
      // INSERT alone cannot do this; only ROLLBACK TO SAVEPOINT undoes the
      // error AND the lot/balance rows this attempt already wrote earlier in
      // this same (otherwise un-savepointed) transaction, so the loser never
      // leaves an orphaned duplicate lot/balance behind.
      await executor.execute(sql`rollback to savepoint unit_commit`);
      if (isUnitCommitConflict(error)) {
        // Someone else's concurrent call with this exact idempotencyKey won
        // the race and already committed this unit (and already incremented
        // wrr_items.scanned_qty) — graceful idempotent no-op, the same
        // outcome a sequential retry gets from the SELECT check above.
        return { ok: true };
      }
      throw error;
    }
  } else {
    // Test-double DB with no raw `.execute` escape hatch: run the same
    // writes directly, unchanged from this function's pre-fix behavior.
    await writeUnit();
  }

  // wrr_items.scanned_qty now means "units committed so far" (design.md §9's
  // 2026-08-20 re-scoping) — increment by 1, and record this unit's chosen
  // location as the line's most-recently-used putaway location (§5.1's
  // re-interpretation; the authoritative record is always
  // lot_location_balances, not this column). committed_at is set only once
  // this brings the line to its terminal state.
  //
  // Fixed 2026-08-21 (db-migration-verifier, Bug B, part 2): re-derived from
  // a value read AFTER this transaction's own row lock above (or, when no
  // lock is available, expressed as a single atomic `scanned_qty + 1` SQL
  // read-modify-write RETURNING the post-increment row) — not the pre-call
  // `line.scannedQty` snapshot, which under real concurrency let the last
  // committing transaction's absolute `SET scanned_qty = <stale + 1>`
  // silently overwrite every other racer's already-applied increment.
  // `isTerminal` is likewise re-derived from the actual post-increment
  // scanned_qty/committed_at the database now holds, never the pre-call
  // snapshot.
  let isTerminal: boolean;
  if (canUseRawSql) {
    const updateRows = (await executor.execute(sql`
      update wrr_items
      set scanned_qty = scanned_qty + 1,
          putaway_location_id = ${params.locationId},
          committed_at = case when scanned_qty + 1 >= expected_qty then now() else committed_at end
      where id = ${line.id}
      returning scanned_qty, committed_at
    `)) as unknown as Array<{ scanned_qty: number; committed_at: Date | string | null }>;
    isTerminal = updateRows[0]?.committed_at != null;
  } else {
    // Test-double DB path, unchanged from this function's pre-fix behavior
    // (no concurrency is exercised against mocked call sites — see the
    // module-level DbLike doc comment).
    const newCommittedCount = line.scannedQty + 1;
    isTerminal = newCommittedCount >= line.expectedQty;
    await tx
      .update(wrrItems)
      .set({
        scannedQty: newCommittedCount,
        putawayLocationId: params.locationId,
        ...(isTerminal ? { committedAt: new Date() } : {}),
      })
      .where(eq(wrrItems.id, line.id));
  }

  if (isTerminal) {
    await reevaluateWrrCompletion(tx, doc.id, userId);
  }

  return { ok: true };
}

/**
 * Commits a whole `inspect`-disposition line as one event (design.md §6.3,
 * §9 — UNCHANGED by the 2026-08-20 per-unit amendment, which is store-only).
 * Still gated on the full scanned_qty being reached first, and still uses
 * committed_at as its own per-line idempotency gate (a conditional UPDATE
 * claims the NULL-to-timestamp transition before any inventory row posts).
 */
async function commitInspectLine(
  tx: DbLike,
  doc: { id: string; status: string; flowType: string; vendorPartyId: string; pezaNumber: string | null; commercialInvoiceNo: string | null; ipNumber: string | null },
  line: WrrLine,
  params: { locationId: string },
  userId: string,
): Promise<CommitWrrLineResult> {
  // Idempotency short-circuit (R7.5, unchanged from 2026-08-10): once a line
  // has committed, its own committed_at is authoritative on its own,
  // independent of the WRR's current status.
  const existingRows = await tx
    .select({ committedAt: wrrItems.committedAt })
    .from(wrrItems)
    .where(eq(wrrItems.id, line.id));
  if (existingRows.length === 1 && existingRows[0].committedAt !== null) {
    return { ok: true };
  }

  const location = await resolveCommitLocation(tx, params.locationId);

  const validation = validateLineCommit(
    { id: doc.id, status: doc.status, flowType: doc.flowType, vendorPartyId: doc.vendorPartyId },
    line,
    location,
  );
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  // Conditional claim: only the caller who flips committed_at from NULL to
  // now() may post this line's inventory rows below.
  const claimed = await tx
    .update(wrrItems)
    .set({ committedAt: new Date() })
    .where(and(eq(wrrItems.id, line.id), isNull(wrrItems.committedAt)))
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
        status: "quarantined",
        pezaNumber: doc.pezaNumber,
        commercialInvoiceNo: doc.commercialInvoiceNo,
        ipNumber: doc.ipNumber,
      })
      .returning({ id: lots.id });

    await tx.insert(lotLocationBalances).values({
      lotId: lot.id,
      locationId: params.locationId,
      qtyReceived: line.scannedQty,
      qtyRemaining: line.scannedQty,
      qtyCommitted: 0,
    });

    await tx.insert(inventoryTransactions).values({
      // A WRR item UUID is globally unique and keeps the receipt reference
      // below the schema's 50-character limit, unlike concatenating two
      // full UUIDs. It also makes a retried commit deterministically refer
      // to the same physical line.
      transactionNumber: `RCV-${line.id}`,
      lotId: lot.id,
      itemId: line.itemId!,
      movementType: "receiving",
      toLocationId: params.locationId,
      qty: line.scannedQty,
      flowType: doc.flowType as "vmi" | "trading" | "supplies",
      commercialInvoiceNo: doc.commercialInvoiceNo,
      wrrId: doc.id,
      performedByUserId: userId,
    });

    // An inspect-disposition receipt is not complete when the lot is merely
    // quarantined. It must also open the shared inbound inspection case that
    // drives Master Inventory's Inspection tab and the subsequent resolution
    // workflow. Keeping this in the same transaction means a successfully
    // committed held lot can never be stranded without an inspection task.
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
  // If claimed.length === 0, this line was already committed by a prior
  // call — idempotent retry; nothing more to post for this line.

  await reevaluateWrrCompletion(tx, doc.id, userId);

  return { ok: true };
}

/**
 * Commits either ONE physical unit of a `store`-disposition line (per-unit,
 * design.md §9 amended 2026-08-20) or the WHOLE of an `inspect`-disposition
 * line (per-line, unchanged) — dispatched on `line.disposition`. Once every
 * line on the WRR has reached its terminal committed state, the WRR
 * transitions to 'confirmed'; until then it remains 'receiving_in_progress'.
 * Requires receiving.confirm capability.
 *
 * `params.idempotencyKey` is REQUIRED for a `store` line (each unit-commit's
 * own idempotency key, R7.5) and unused for an `inspect` line (which
 * continues to use wrr_items.committed_at as its sole per-line idempotency
 * gate, unchanged from 2026-08-10).
 *
 * See specs/07-incoming-receiving/design.md §9 (Reversed 2026-08-10,
 * amended 2026-08-20).
 */
export async function commitWrrLine(
  resolver: RequestAuthorizationResolver,
  wrrId: string,
  wrrItemId: string,
  params: { locationId: string; idempotencyKey?: string },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CommitWrrLineResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "receiving.confirm");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const userId = perm.context.userId;

  // Every read, validation, and inventory write for this one unit/line
  // occurs through one RLS-claimed transaction.
  const rlsResult = await withRlsTransaction(rlsDeps, async (rlsTx) => {
    const tx = rlsTx.db as DbLike;
    const doc = await fetchWrrForAction(tx, wrrId);
    if (doc === null) {
      return { ok: false, errors: ["not_found"] } satisfies CommitWrrLineResult;
    }

    const line = doc.items.find((item) => item.id === wrrItemId);
    if (!line) {
      return { ok: false, errors: ["not_found"] } satisfies CommitWrrLineResult;
    }

    if (line.disposition === "store") {
      return commitStoreUnit(tx, doc, line, params, userId);
    }

    return commitInspectLine(tx, doc, line, params, userId);
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}
