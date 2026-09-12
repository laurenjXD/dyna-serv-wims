import { NextResponse } from "next/server";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { isVmiDocumentType } from "@/lib/documents/vmi-artifacts";
import { renderVmiBillingPdf } from "@/lib/documents/render-vmi-billing-pdf";
import { loadVmiDocumentPdfData } from "@/lib/billing/vmi-document-pdf-data";

interface RouteProps { params: Promise<{ periodId: string; type: string }>; }

export async function GET(_request: Request, { params }: RouteProps) {
  const { periodId, type } = await params;
  if (!isVmiDocumentType(type)) return NextResponse.json({ error: "Unknown VMI document type." }, { status: 400 });

  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "reporting.financial_read");
  if (permission.kind !== "authorized") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await loadVmiDocumentPdfData(db, periodId);
  if (!data) return NextResponse.json({ error: "Billing period not found." }, { status: 404 });
  const bytes = await renderVmiBillingPdf(type, data);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${data.period.periodNumber}-${type}.pdf"`, "Cache-Control": "private, no-store" } });
}
