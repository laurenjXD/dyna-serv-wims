import { NextResponse } from "next/server";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { isVmiDocumentType } from "@/lib/documents/vmi-artifacts";
import { renderVmiBillingPdf } from "@/lib/documents/render-vmi-billing-pdf";
import { loadVmiDocumentPdfData } from "@/lib/billing/vmi-document-pdf-data";
import { getDocumentTemplate } from "@/lib/documents/document-template";

interface RouteProps { params: Promise<{ periodId: string; type: string }>; }

export async function GET(_request: Request, { params }: RouteProps) {
  const { periodId, type } = await params;
  if (!isVmiDocumentType(type)) return NextResponse.json({ error: "Choose a valid VMI billing document to download." }, { status: 400 });

  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "reporting.financial_read");
  if (permission.kind !== "authorized") return NextResponse.json({ error: "You do not have permission to download billing documents. Ask an administrator for access." }, { status: 403 });

  const data = await loadVmiDocumentPdfData(db, periodId);
  if (!data) return NextResponse.json({ error: "This billing period is unavailable. Return to VMI Billing and choose another period." }, { status: 404 });
  const bytes = await renderVmiBillingPdf(type, data, await getDocumentTemplate(db));
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${data.period.periodNumber}-${type}.pdf"`, "Cache-Control": "private, no-store" } });
}
