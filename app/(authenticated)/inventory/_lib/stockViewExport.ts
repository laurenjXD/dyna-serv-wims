import type { StockViewRow } from "@/lib/db/queries/inventory";

export const STOCK_VIEW_EXPORT_COLUMNS = [
  "Item Code",
  "Item Name",
  "UOM",
  "Lot Number",
  "Location",
  "Available Quantity",
  "Committed Quantity",
  "Expiry Date",
  "Received Date",
  "Lot Status",
  "Allocation Method",
] as const;

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stringCell(value: string | number) {
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function numberCell(value: number) {
  return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
}

/**
 * Builds a SpreadsheetML workbook that Microsoft Excel opens directly.
 * It deliberately exports one row per item/lot/location balance so no
 * quantity detail is lost through the Stock View's on-screen grouping.
 */
export function toStockViewSpreadsheetXml(rows: StockViewRow[]) {
  const header = STOCK_VIEW_EXPORT_COLUMNS.map(stringCell).join("");
  const body = rows.map((row) => {
    const availableQty = row.qtyRemaining - row.qtyCommitted;
    const allocationMethod = row.isPerishable ? "FEFO" : "FIFO";
    return `<Row>${[
      stringCell(row.itemCode),
      stringCell(row.itemName),
      stringCell(row.uom),
      stringCell(row.lotNumber),
      stringCell(row.locationLabel),
      numberCell(availableQty),
      numberCell(row.qtyCommitted),
      stringCell(row.expiryDate ?? ""),
      stringCell(row.receivedAt.toISOString().slice(0, 10)),
      stringCell(row.lotStatus),
      stringCell(allocationMethod),
    ].join("")}</Row>`;
  }).join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Stock View">
  <Table>
   <Row>${header}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
}
