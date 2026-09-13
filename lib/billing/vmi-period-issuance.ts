import { eq, inArray } from "drizzle-orm";
import { documentEvents, generatedDocuments } from "@/lib/db/schema/documents";
import { vmiBillingPeriods } from "@/lib/db/schema/vmi_billing";
import { ensureVmiDocumentArtifacts } from "@/lib/billing/vmi-document-artifacts";
import { loadVmiDocumentPdfData } from "@/lib/billing/vmi-document-pdf-data";
import { renderVmiBillingPdf } from "@/lib/documents/render-vmi-billing-pdf";
import { buildVmiArtifactPath, type VmiDocumentType, VMI_DOCUMENT_TYPES } from "@/lib/documents/vmi-artifacts";

type DbLike = any;
type StorageLike = {
  from(bucket: string): {
    upload(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }>;
    remove(paths: string[]): Promise<{ error: { message: string } | null }>;
  };
};

const BUCKET = "generated-documents";

export type VmiPeriodIssuanceResult = { ok: true; documentIds: string[] } | { ok: false; error: string };

/**
 * Finalizes a draft period only after each official PDF has been rendered and
 * uploaded to private Storage. There is no DB/Storage distributed transaction,
 * so a failed upload removes only files created by this attempt and returns
 * artifact rows to pending; the billing period remains a mutable draft.
 */
export async function issueVmiPeriodDocuments(
  db: DbLike,
  storage: StorageLike,
  input: { periodId: string; actorId: string; now?: Date },
): Promise<VmiPeriodIssuanceResult> {
  const [period] = await db.select().from(vmiBillingPeriods).where(eq(vmiBillingPeriods.id, input.periodId)).limit(1);
  if (!period) return { ok: false, error: "Billing period not found." };
  if (period.status !== "draft") return { ok: false, error: "Only a draft billing period can be issued." };

  const artifactIds = await ensureVmiDocumentArtifacts(db, {
    id: period.id,
    periodNumber: period.periodNumber,
    partyId: period.partyId,
    periodStartDate: period.periodStartDate,
    periodEndDate: period.periodEndDate,
    billingStatementTotalUsd: Number(period.billingStatementTotalUsd),
    soaOpeningBalanceUsd: Number(period.soaOpeningBalanceUsd),
    soaClosingBalanceUsd: Number(period.soaClosingBalanceUsd),
    billingCurrency: period.billingCurrency,
  });
  const documentIds = Object.values(artifactIds);
  const docs = await db.select({ id: generatedDocuments.id, documentType: generatedDocuments.documentType, status: generatedDocuments.status, artifactPath: generatedDocuments.artifactPath })
    .from(generatedDocuments).where(inArray(generatedDocuments.id, documentIds));
  if (docs.length !== VMI_DOCUMENT_TYPES.length) return { ok: false, error: "All four document records must be prepared before issue." };

  const documentByType = new Map(docs.map((doc: any) => [doc.documentType, doc]));
  if (VMI_DOCUMENT_TYPES.some((type) => !documentByType.has(type))) return { ok: false, error: "A required billing document record is missing." };
  if (docs.some((doc: any) => doc.status === "ready" && !doc.artifactPath)) {
    return { ok: false, error: "A ready document is missing its private Storage artifact. Create a correction instead of overwriting an immutable document." };
  }

  const data = await loadVmiDocumentPdfData(db, input.periodId);
  if (!data) return { ok: false, error: "Billing period not found." };
  const now = input.now ?? new Date();
  const createdPaths: string[] = [];
  const uploaded = new Map<string, { path: string; sizeBytes: number }>();
  const activeIds = docs.filter((doc: any) => doc.status !== "ready").map((doc: any) => doc.id);

  try {
    if (activeIds.length > 0) {
      await db.update(generatedDocuments).set({ status: "generating" }).where(inArray(generatedDocuments.id, activeIds));
    }

    for (const type of VMI_DOCUMENT_TYPES) {
      const doc = documentByType.get(type) as { id: string; status: string; artifactPath: string | null };
      if (doc.status === "ready" && doc.artifactPath) continue;
      const bytes = await renderVmiBillingPdf(type, data);
      const path = buildVmiArtifactPath(input.periodId, doc.id, type);
      const upload = await storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw new Error(`${type}: ${upload.error.message}`);
      createdPaths.push(path);
      uploaded.set(doc.id, { path, sizeBytes: bytes.byteLength });
    }

    for (const type of VMI_DOCUMENT_TYPES) {
      const doc = documentByType.get(type) as { id: string; status: string; artifactPath: string | null };
      const artifact = uploaded.get(doc.id);
      if (!artifact) continue;
      await db.update(generatedDocuments).set({
        status: "ready", artifactPath: artifact.path, mimeType: "application/pdf", sizeBytes: artifact.sizeBytes, generatedAt: now,
      }).where(eq(generatedDocuments.id, doc.id));
      await db.insert(documentEvents).values({ documentId: doc.id, eventType: "generated", actorId: input.actorId, systemExecutor: "vmi-billing", metadata: { source: "period_issue", artifactPath: artifact.path }, occurredAt: now });
    }

    await db.update(vmiBillingPeriods).set({ status: "issued", closedByUserId: input.actorId, closedAt: now }).where(eq(vmiBillingPeriods.id, input.periodId));
    return { ok: true, documentIds };
  } catch (cause) {
    if (createdPaths.length > 0) await storage.from(BUCKET).remove(createdPaths);
    if (activeIds.length > 0) {
      await db.update(generatedDocuments).set({ status: "pending", artifactPath: null, mimeType: "application/pdf", sizeBytes: null, generatedAt: null }).where(inArray(generatedDocuments.id, activeIds));
      await Promise.all(activeIds.map((documentId: string) => db.insert(documentEvents).values({ documentId, eventType: "failed", actorId: input.actorId, systemExecutor: "vmi-billing", metadata: { source: "period_issue" }, occurredAt: now })));
    }
    return { ok: false, error: cause instanceof Error ? cause.message : "Document generation failed." };
  }
}
