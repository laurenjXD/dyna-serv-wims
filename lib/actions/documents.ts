"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
// Document actions — requestDocumentReprint / getDocumentSignedUrl / retryDocumentGeneration.
//
// Traceability:
//   specs/10-pick-list-and-acknowledgement-receipt/design.md §7.3, §8.1, §10
//   specs/10-pick-list-and-acknowledgement-receipt/tasks.md Task 7.2

import { eq } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { db as globalDb } from "@/lib/db/client";
import { generatedDocuments, documentEvents } from "@/lib/db/schema/documents";
import { inventoryCommitments } from "@/lib/db/schema/commitments";
import { getStorageClient } from "@/lib/supabase/storage";

type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export interface DocumentReprintResult {
  documentId: string;
  documentNumber: string;
  documentType: string;
  watermarkText: string;
  artifactPath: string | null;
  reprintedAt: string;
}

/**
 * Log a reprint event and return watermarked print/view instructions.
 */
export async function requestDocumentReprint(
  resolver: RequestAuthorizationResolver,
  input: { documentId: string; reason?: string },
  db: DbLike = globalDb as any,
): Promise<ActionResult<DocumentReprintResult>> {
  const perm = await requirePermission(resolver, "documents.read");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "Permission denied: documents.read required", code: "PERMISSION_DENIED" };
  }

  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, input.documentId))
    .limit(1);

  if (!doc) {
    return { ok: false, error: "Document not found", code: "DOCUMENT_NOT_FOUND" };
  }

  if (doc.status === "pending" || doc.status === "generating") {
    return { ok: false, error: "The document is still being generated. Refresh shortly.", code: "DOCUMENT_PENDING" };
  }
  if (doc.status === "failed") {
    return { ok: false, error: "Document generation failed. Retry generation before downloading.", code: "DOCUMENT_FAILED" };
  }
  if (doc.status === "voided") {
    return { ok: false, error: "This document has been voided and is no longer downloadable.", code: "DOCUMENT_VOIDED" };
  }

  if (doc.status !== "ready") {
    return {
      ok: false,
      error: `Cannot reprint document in '${doc.status}' status (must be 'ready')`,
      code: "INVALID_STATUS",
    };
  }

  const now = new Date();
  const manilaIso = now.toISOString();
  const watermarkText = `REPRINT — ${manilaIso}`;

  await db.insert(documentEvents).values({
    documentId: doc.id,
    eventType: "reprinted",
    actorId: perm.context.userId as any,
    metadata: {
      reason: input.reason?.trim() || "Reprint requested from Documents Center",
      watermark: watermarkText,
      timestamp: manilaIso,
    },
    occurredAt: now,
  });

  return {
    ok: true,
    data: {
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      documentType: doc.documentType,
      watermarkText,
      artifactPath: doc.artifactPath,
      reprintedAt: manilaIso,
    },
  };
}

/**
 * Return a preview / signed URL for a generated document artifact.
 */
export async function getDocumentSignedUrl(
  resolver: RequestAuthorizationResolver,
  documentId: string,
  db: DbLike = globalDb as any,
): Promise<ActionResult<{ signedUrl: string; filename: string; mimeType: string }>> {
  const perm = await requirePermission(resolver, "documents.read");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "Permission denied: documents.read required", code: "PERMISSION_DENIED" };
  }

  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, documentId))
    .limit(1);

  if (!doc) {
    return { ok: false, error: "Document not found", code: "DOCUMENT_NOT_FOUND" };
  }

  // Pick-list/receipt routes are generated dynamically; stored artifacts use
  // a short-lived private-storage URL and never expose the bucket path.
  const filename = `${doc.documentNumber}.pdf`;
  let url: string;
  if (doc.artifactPath) {
    const { data, error } = await (await getStorageClient())
      .from("generated-documents")
      .createSignedUrl(doc.artifactPath, 60 * 15);
    if (error || !data?.signedUrl) {
      return { ok: false, error: "Document storage is temporarily unavailable. Retry shortly.", code: "DOCUMENT_STORAGE_UNAVAILABLE" };
    }
    url = data.signedUrl;
  } else {
    let pickListId = doc.sourceId as string;
    if (doc.sourceType === "inventory_commitment") {
      const [commitment] = await db
        .select({ pickListId: inventoryCommitments.pickListId })
        .from(inventoryCommitments)
        .where(eq(inventoryCommitments.id, doc.sourceId))
        .limit(1);
      if (!commitment?.pickListId) {
        return { ok: false, error: "The document source is unavailable. Retry generation or contact an administrator.", code: "DOCUMENT_SOURCE_UNAVAILABLE" };
      }
      pickListId = commitment.pickListId;
    }
    url = `/api/pick-lists/${pickListId}/receipt`;
  }

  return {
    ok: true,
    data: {
      signedUrl: url,
      filename,
      mimeType: doc.mimeType ?? "application/pdf",
    },
  };
}

/**
 * Retry failed document generation.
 */
export async function retryDocumentGeneration(
  resolver: RequestAuthorizationResolver,
  documentId: string,
  db: DbLike = globalDb as any,
): Promise<ActionResult<{ documentId: string; status: string }>> {
  const perm = await requirePermission(resolver, "documents.read");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "Permission denied: documents.read required", code: "PERMISSION_DENIED" };
  }

  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, documentId))
    .limit(1);

  if (!doc) {
    return { ok: false, error: "Document not found", code: "DOCUMENT_NOT_FOUND" };
  }

  if (doc.status !== "failed") {
    return {
      ok: false,
      error: "Only failed documents can be retried. The existing document state was preserved.",
      code: "DOCUMENT_NOT_RETRYABLE",
    };
  }

  await db
    .update(generatedDocuments)
    .set({ status: "pending" })
    .where(eq(generatedDocuments.id, documentId));

  await db.insert(documentEvents).values({
    documentId: doc.id,
    eventType: "generated",
    actorId: perm.context.userId as any,
    metadata: { retry: true, previousStatus: doc.status },
    occurredAt: new Date(),
  });

  return {
    ok: true,
    data: {
      documentId: doc.id,
      status: "pending",
    },
  };
}
