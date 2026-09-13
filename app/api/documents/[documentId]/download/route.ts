import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { getStorageClient } from "@/lib/supabase/storage";

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

  if (doc.status !== "ready" || !doc.artifactPath) {
    return NextResponse.json({ error: "This document is not ready for download." }, { status: 409 });
  }

  const download = await (await getStorageClient()).from("generated-documents").download(doc.artifactPath);
  if (download.error) return NextResponse.json({ error: "The stored document could not be downloaded." }, { status: 502 });
  const body = await download.data.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": doc.mimeType ?? "application/pdf",
      "Content-Disposition": `inline; filename="${doc.documentNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
