import { createPageResolver } from "@/lib/auth/page-resolver";
import { db } from "@/lib/db/client";
import { listStockView } from "@/lib/db/queries/inventory";
import { requirePermission } from "@/lib/rbac/guard";
import { toStockViewSpreadsheetXml } from "../_lib/stockViewExport";

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
