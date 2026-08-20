import { createPageResolver } from "@/lib/auth/page-resolver";
import { db } from "@/lib/db/client";
import { listStockView } from "@/lib/db/queries/inventory";
import { requirePermission } from "@/lib/rbac/guard";
import { toStockViewSpreadsheetXml } from "../_lib/stockViewExport";

// Route Handlers aren't nested in the app's layout tree, so they don't
// inherit app/layout.tsx's `preferredRegion` — this DB-querying export
// needs its own, same reasoning (co-locate with the Tokyo/ap-northeast-1
// Supabase database). See specs/00-steering/revision-log.md's
// "Vercel/Supabase region mismatch" entry (2026-08-17).
export const preferredRegion = "hnd1";

export async function GET() {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.read");

  if (permission.kind !== "authorized") {
    return new Response("Not found", { status: 404 });
  }

  const spreadsheet = toStockViewSpreadsheetXml(await listStockView(db));
  const date = new Date().toISOString().slice(0, 10);

  return new Response(spreadsheet, {
    headers: {
      "Content-Disposition": `attachment; filename="stock-view-${date}.xls"`,
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
