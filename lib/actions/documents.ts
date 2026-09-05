"use server";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Fallback direct path or storage URL
  const filename = `${doc.documentNumber}.pdf`;
  const url = doc.artifactPath
    ? `/api/documents/${doc.id}/download`
    : `/api/pick-lists/${doc.sourceId}/receipt`;

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
