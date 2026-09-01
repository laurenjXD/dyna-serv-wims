import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.07, 0.1, 0.16);
const MUTED = rgb(0.39, 0.46, 0.58);
const GRID = rgb(0.25, 0.3, 0.38);
const HEADER_FILL = rgb(0.84, 0.86, 0.9);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["—"];
}

function drawCell(
  page: PDFPage,
  value: string,
  x: number,
  top: number,
  width: number,
  height: number,
  font: PDFFont,
  size: number,
  align: "left" | "center" = "left",
) {
  page.drawRectangle({ x, y: top - height, width, height, borderColor: GRID, borderWidth: 0.6 });
  const lines = wrapText(value, font, size, width - 8);
  const lineHeight = size + 2;
  const startY = top - Math.max(size + 3, (height + (lines.length - 1) * lineHeight) / 2 + size / 2 - 1);
  lines.slice(0, 3).forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: align === "center" ? x + (width - lineWidth) / 2 : x + 4,
      y: startY - index * lineHeight,
      size,
      font,
      color: INK,
    });
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pickListId: string }> },
) {
  const { pickListId } = await params;
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.read");
  if (permission.kind !== "authorized") return new NextResponse("Not found", { status: 404 });

  const pickList = await getPickList(db, pickListId);
  if (!pickList) return new NextResponse("Not found", { status: 404 });
  const [lines, partyRows] = await Promise.all([
    getPickListItems(db, pickListId),
    db.select({ name: parties.name, address1: parties.address1, address2: parties.address2 })
      .from(parties).where(eq(parties.id, pickList.customerPartyId)).limit(1),
  ]);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const party = partyRows[0];
  const drNumber = `DR-${pickList.pickListNumber.replace(/^PL-/, "")}`;

  page.drawText("ACKNOWLEDGEMENT RECEIPT", { x: MARGIN, y: 535, size: 16, font: bold, color: INK });
  page.drawText("Warehouse Inventory Management System", { x: MARGIN, y: 516, size: 8, font: regular, color: MUTED });
  const meta = [
    ["DELIVERY RECEIPT NO.", drNumber],
    ["PICK LIST NO.", pickList.pickListNumber],
    ["DELIVERY DATE", pickList.createdAt.toLocaleDateString()],
  ];
  meta.forEach(([label, value], index) => {
    page.drawText(label, { x: 595, y: 535 - index * 17, size: 8, font: bold, color: INK });
    page.drawText(value, { x: 718, y: 535 - index * 17, size: 8, font: index < 2 ? bold : regular, color: INK });
  });
  page.drawText("DELIVERY TO:", { x: MARGIN, y: 478, size: 8, font: bold, color: INK });
  page.drawText(party?.name ?? pickList.customerPartyId, { x: MARGIN, y: 465, size: 9, font: bold, color: INK });
  page.drawText([party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file", { x: MARGIN, y: 452, size: 8, font: regular, color: MUTED });
  page.drawText(`Inventory Model: ${pickList.flowType}`, { x: 650, y: 465, size: 8, font: bold, color: INK });
  page.drawLine({ start: { x: MARGIN, y: 438 }, end: { x: PAGE_WIDTH - MARGIN, y: 438 }, thickness: 1.3, color: INK });

  const headings = ["NO.", "QTY", "SPQ", "NO. OF BOXES", "ITEM CODE", "CUST PN", "ITEM DESCRIPTION", "LOT NUMBER", "PO NUMBER", "INVOICE NO.", "REMARKS", "LOCATION"];
  const widths = [28, 42, 38, 54, 76, 62, 122, 76, 64, 64, 70, 89];
  let x = MARGIN;
  headings.forEach((heading, index) => {
    drawCell(page, heading, x, 424, widths[index], 32, bold, 7, "center");
    x += widths[index];
  });

  let rowTop = 392;
  for (const [index, line] of lines.entries()) {
    x = MARGIN;
    const values = [
      String(index + 1), line.qty.toLocaleString(), line.spq.toLocaleString(), line.numberOfBoxes.toLocaleString(),
      line.itemCode, line.customerItemCode ?? "—", line.itemDescription ?? "—", line.lotNumber, "—", "—", "—", line.locationLabel,
    ];
    values.forEach((value, column) => {
      drawCell(page, value, x, rowTop, widths[column], 38, column === 4 ? bold : regular, 7, column < 4 ? "center" : "left");
      x += widths[column];
    });
    rowTop -= 38;
  }
  x = MARGIN;
  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
  const totalBoxes = lines.reduce((sum, line) => sum + line.numberOfBoxes, 0);
  ["TOTAL", totalQty.toLocaleString(), "—", totalBoxes.toLocaleString(), "", "", "", "", "", "", "", ""].forEach((value, column) => {
    drawCell(page, value, x, rowTop, widths[column], 24, bold, 7, column < 4 ? "center" : "left");
    x += widths[column];
  });

  const instructionTop = rowTop - 14;
  page.drawRectangle({ x: MARGIN, y: instructionTop - 48, width: CONTENT_WIDTH, height: 48, borderColor: GRID, borderWidth: 0.6 });
  page.drawRectangle({ x: MARGIN, y: instructionTop - 18, width: CONTENT_WIDTH, height: 18, color: HEADER_FILL, borderColor: GRID, borderWidth: 0.6 });
  page.drawText("DELIVERY INSTRUCTIONS / REMARKS", { x: MARGIN + 5, y: instructionTop - 13, size: 7, font: bold, color: INK });
  page.drawText("—", { x: MARGIN + 5, y: instructionTop - 35, size: 8, font: regular, color: MUTED });

  const footerTop = instructionTop - 66;
  const footerWidths = [CONTENT_WIDTH / 3, CONTENT_WIDTH / 3, CONTENT_WIDTH / 3];
  ["CHECKED BY:", "LOADED BY:", "ACKNOWLEDGED & RECEIVED BY:"].forEach((label, index) => {
    const footerX = MARGIN + footerWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
    page.drawRectangle({ x: footerX, y: footerTop - 58, width: footerWidths[index], height: 58, borderColor: GRID, borderWidth: 0.6 });
    page.drawText(label, { x: footerX + 5, y: footerTop - 14, size: 7, font: bold, color: INK });
  });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${drNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
