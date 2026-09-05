import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { generatedDocuments } from "@/lib/db/schema/documents";

interface RouteParams {
  params: Promise<{
    documentId: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { documentId } = await params;

  const resolver = await createPageResolver();
  const perm = await requirePermission(resolver, "documents.read");
  if (perm.kind !== "authorized") {
    return NextResponse.json(
      { error: "Forbidden: documents.read required" },
      { status: 403 },
    );
  }

  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, documentId))
    .limit(1);

  if (!doc) {
    return NextResponse.json(
      { error: "Document not found" },
      { status: 404 },
    );
  }

  // If source is a pick list or withdrawal commitment, redirect to receipt stream if needed
  if (doc.sourceType === "inventory_commitment" || doc.documentType === "acknowledgement_receipt" || doc.documentType === "pick_list") {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/api/pick-lists/${doc.sourceId}/receipt`);
  }

  // Fallback PDF stream or content response
  return NextResponse.json(
    {
      id: doc.id,
      documentNumber: doc.documentNumber,
      documentType: doc.documentType,
      status: doc.status,
      artifactPath: doc.artifactPath,
      snapshotHash: doc.snapshotHash,
      mimeType: doc.mimeType ?? "application/pdf",
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
