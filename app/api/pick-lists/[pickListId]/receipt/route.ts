import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { vmiPermits } from "@/lib/db/schema/vmi_billing";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";
import { PDF_PAGE, PDF_THEME } from "@/lib/documents/pdf-theme";
import { getDocumentTemplate } from "@/lib/documents/document-template";

const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = PDF_PAGE.landscape;
const { margin: MARGIN, ink: INK, muted: MUTED, grid: GRID, headerFill: HEADER_FILL } = PDF_THEME;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RECEIPT_FONT_SIZE = 8;
const RECEIPT_LINE_HEIGHT = 10;
const RECEIPT_LABEL_SIZE = 7.5;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      let chunk = "";
      for (const character of word) {
        const candidate = `${chunk}${character}`;
        if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk = candidate;
        }
      }
      line = chunk;
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [text];
}

function drawCell(
  page: PDFPage,
  text: string,
  x: number,
  yTop: number,
  width: number,
  height: number,
  font: PDFFont,
  size: number,
  align: "left" | "center" = "left",
  fillColor?: ReturnType<typeof rgb>,
) {
  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    borderColor: GRID,
    borderWidth: 0.8,
    color: fillColor,
  });

  const lines = wrapText(text, font, size, width - 8);
  const lineHeight = Math.min(RECEIPT_LINE_HEIGHT, size + 2);
  const blockHeight = lines.length * lineHeight;
  const startY = yTop - (height - blockHeight) / 2 - size;

  lines.slice(0, 3).forEach((line, index) => {
    const textWidth = font.widthOfTextAtSize(line, size);
    const textX = align === "center" ? x + (width - textWidth) / 2 : x + 4;
    page.drawText(line, {
      x: textX,
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
  const [lines, partyRows, permitRows] = await Promise.all([
    getPickListItems(db, pickListId),
    db.select({ name: parties.name, address1: parties.address1, address2: parties.address2 })
      .from(parties).where(eq(parties.id, pickList.endCustomerPartyId)).limit(1),
    db.select({ permitNumber: vmiPermits.permitNumber })
      .from(vmiPermits)
      .where(and(eq(vmiPermits.partyId, pickList.customerPartyId), eq(vmiPermits.isActive, true)))
      .limit(1),
  ]);

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const party = partyRows[0];
  const pezaPermitNo = permitRows[0]?.permitNumber ?? null;
  const drNumber = `DR-${pickList.pickListNumber.replace(/^PL-/, "")}`;
  const template = await getDocumentTemplate(db);

  let logoImage: PDFImage | undefined;
  try {
    const logoPath = template.logoUrl?.startsWith("/") ? template.logoUrl.slice(1) : "logo-hd.png";
    const logoPng = await readFile(path.join(process.cwd(), "public", logoPath));
    logoImage = await pdf.embedPng(logoPng);
  } catch {
    // Fallback if logo file is not found
  }

  const nonNullPickList = pickList;
  const isPricedFlow = nonNullPickList.flowType === "trading" || nonNullPickList.flowType === "vmi";
  const headings = isPricedFlow
    ? ["NO.", "QTY", "SPQ", "BOXES", "ITEM CODE", "CUST PN", "DESCRIPTION", "LOT", "MFG DATE", "EXPIRY DATE", "LOCATION", "UNIT PRICE", "LINE TOTAL", "REMARKS"]
    : ["NO.", "QTY", "SPQ", "NO. OF BOXES", "ITEM CODE", "CUST PN", "ITEM DESCRIPTION", "LOT NUMBER", "MFG DATE", "EXPIRY DATE", "PO NUMBER", "INVOICE NO.", "REMARKS", "LOCATION"];
  const widths = isPricedFlow
    ? [34, 38, 32, 42, 64, 50, 90, 58, 45, 45, 75, 60, 70, 73.89]
    : [34, 42, 38, 54, 74, 56, 96, 62, 45, 45, 54, 60, 60, 65.89];

  // Helper to draw standard document header & table header
  function renderDocumentHeader(page: PDFPage, pageNum: number, totalPages: number): number {
    if (logoImage) {
      page.drawImage(logoImage, { x: MARGIN, y: 522, width: 30, height: 30 });
    }
    const headerX = MARGIN + (logoImage ? 38 : 0);
    page.drawText("ACKNOWLEDGEMENT RECEIPT", { x: headerX, y: 540, size: 10, font: bold, color: INK });
    page.drawText(`${template.companyName} - ${template.subtitle}`, { x: headerX, y: 526, size: RECEIPT_FONT_SIZE, font: bold, color: MUTED });

    const meta = [
      ["DELIVERY RECEIPT NO.", drNumber],
      ["PICK LIST NO.", nonNullPickList.pickListNumber],
      ["PEZA PERMIT NO.", pezaPermitNo || "—"],
      ["DELIVERY DATE", nonNullPickList.createdAt.toLocaleDateString()],
    ];
    meta.forEach(([label, value], index) => {
      page.drawText(label, { x: 580, y: 544 - index * 11, size: RECEIPT_FONT_SIZE, font: bold, color: INK });
      page.drawText(value, { x: 705, y: 544 - index * 11, size: RECEIPT_FONT_SIZE, font: bold, color: INK });
    });

    if (totalPages > 1) {
      page.drawText(`PAGE ${pageNum} OF ${totalPages}`, { x: 730, y: 562, size: RECEIPT_FONT_SIZE, font: bold, color: MUTED });
    }

    page.drawText("DELIVERY TO (END CUSTOMER):", { x: MARGIN, y: 486, size: RECEIPT_FONT_SIZE, font: bold, color: INK });
    page.drawText(party?.name ?? nonNullPickList.endCustomerPartyId, { x: MARGIN, y: 474, size: RECEIPT_FONT_SIZE, font: bold, color: INK });
    page.drawText([party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file", { x: MARGIN, y: 462, size: RECEIPT_FONT_SIZE, font: regular, color: MUTED });
    page.drawText(`Inventory Model: ${nonNullPickList.flowType.toUpperCase()}`, { x: 630, y: 474, size: RECEIPT_FONT_SIZE, font: bold, color: INK });
    page.drawLine({ start: { x: MARGIN, y: 450 }, end: { x: PAGE_WIDTH - MARGIN, y: 450 }, thickness: 1, color: GRID });

    // Table Column Headers
    let x = MARGIN;
    headings.forEach((heading, index) => {
      drawCell(page, heading, x, 442, widths[index], 22, bold, RECEIPT_LABEL_SIZE, "center", HEADER_FILL);
      x += widths[index];
    });

    return 420; // returns top Y coordinate for line items
  }

  const ROW_HEIGHT = 18;
  const ROWS_PER_PAGE_FULL = 18;
  const ROWS_PER_PAGE_WITH_FOOTER = 11;

  // Calculate total pages
  let totalPages = 1;
  if (lines.length > ROWS_PER_PAGE_WITH_FOOTER) {
    const remaining = lines.length - ROWS_PER_PAGE_FULL;
    totalPages = 1 + Math.ceil(Math.max(0, remaining) / ROWS_PER_PAGE_WITH_FOOTER) + (remaining <= 0 ? 1 : 0);
  }

  let currentPageIndex = 0;
  let lineCursor = 0;

  while (lineCursor < lines.length || currentPageIndex === 0) {
    currentPageIndex++;
    const isFinalPage = (lines.length - lineCursor) <= ROWS_PER_PAGE_WITH_FOOTER || lineCursor >= lines.length;
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let rowTop = renderDocumentHeader(page, currentPageIndex, totalPages);

    const maxRowsThisPage = isFinalPage ? ROWS_PER_PAGE_WITH_FOOTER : ROWS_PER_PAGE_FULL;
    const linesToRender = lines.slice(lineCursor, lineCursor + maxRowsThisPage);
    lineCursor += linesToRender.length;

    for (const [idxOffset, line] of linesToRender.entries()) {
      const globalIndex = lineCursor - linesToRender.length + idxOffset;
      let x = MARGIN;
      const lineTotal = line.unitPrice == null ? null : Number(line.unitPrice) * line.qty;
      const values = isPricedFlow
        ? [
            String(globalIndex + 1), line.qty.toLocaleString(), line.spq.toLocaleString(),
            line.numberOfBoxes.toLocaleString(), line.itemCode, line.customerItemCode ?? "—",
            line.itemDescription ?? "—", line.lotNumber, line.manufactureDate ?? "—", line.expiryDate ?? "—", line.locationLabel,
            line.unitPrice == null ? "—" : Number(line.unitPrice).toFixed(4),
            lineTotal == null ? "—" : lineTotal.toFixed(2), "—",
          ]
        : [
            String(globalIndex + 1), line.qty.toLocaleString(), line.spq.toLocaleString(),
            line.numberOfBoxes.toLocaleString(), line.itemCode, line.customerItemCode ?? "—",
            line.itemDescription ?? "—", line.lotNumber, line.manufactureDate ?? "—", line.expiryDate ?? "—", "—", "—", "—", line.locationLabel,
          ];
      values.forEach((value, column) => {
        drawCell(
          page,
          value,
          x,
          rowTop,
          widths[column],
          ROW_HEIGHT,
          column === 4 ? bold : regular,
          RECEIPT_FONT_SIZE,
          column < 4 || column === 5 ? "center" : "left"
        );
        x += widths[column];
      });
      rowTop -= ROW_HEIGHT;
    }

    // Render totals & footer only on final page
    if (isFinalPage || lineCursor >= lines.length) {
      let x = MARGIN;
      const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
      const totalBoxes = lines.reduce((sum, line) => sum + line.numberOfBoxes, 0);
      const referenceTotal = isPricedFlow
        ? lines.reduce((sum, line) => sum + (line.unitPrice == null ? 0 : Number(line.unitPrice) * line.qty), 0)
        : null;
      const totals = isPricedFlow
        ? ["TOTAL", totalQty.toLocaleString(), "-", totalBoxes.toLocaleString(), "", "", "", "", "", "", "", "", referenceTotal == null ? "-" : referenceTotal.toFixed(2), ""]
        : ["TOTAL", totalQty.toLocaleString(), "-", totalBoxes.toLocaleString(), "", "", "", "", "", "", "", "", "", ""];
      totals.forEach((value, column) => {
        drawCell(page, value, x, rowTop, widths[column], 20, bold, column === 0 ? RECEIPT_LABEL_SIZE : RECEIPT_FONT_SIZE, column < 4 ? "center" : "left", HEADER_FILL);
        x += widths[column];
      });

      if (nonNullPickList.flowType === "vmi") {
        page.drawText("Unit prices are per-release reference values only. Authoritative billing is the period VMI statement.", {
          x: MARGIN, y: rowTop - 32, size: RECEIPT_LABEL_SIZE, font: regular, color: MUTED,
        });
      }

      // Delivery Remarks Box
      const instructionTop = rowTop - 20 - (nonNullPickList.flowType === "vmi" ? 30 : 10);
      page.drawRectangle({ x: MARGIN, y: instructionTop - 36, width: CONTENT_WIDTH, height: 36, borderColor: GRID, borderWidth: 0.6 });
      page.drawRectangle({ x: MARGIN, y: instructionTop - 14, width: CONTENT_WIDTH, height: 14, color: HEADER_FILL, borderColor: GRID, borderWidth: 0.6 });
      page.drawText("DELIVERY INSTRUCTIONS / REMARKS", { x: MARGIN + 6, y: instructionTop - 10, size: RECEIPT_FONT_SIZE, font: bold, color: INK });
      page.drawText("Goods delivered in good condition. Certified under ISO 9001:2015 Dyna-Serv logistics standard.", { x: MARGIN + 6, y: instructionTop - 26, size: RECEIPT_FONT_SIZE, font: regular, color: MUTED });

      // Triple Sign-Off Footer
      const footerTop = instructionTop - 46;
      const footerWidths = [CONTENT_WIDTH / 3, CONTENT_WIDTH / 3, CONTENT_WIDTH / 3];
      ["CHECKED & VERIFIED BY:", "LOADED & DISPATCHED BY:", "ACKNOWLEDGED & RECEIVED BY:"].forEach((label, index) => {
        const footerX = MARGIN + footerWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
        page.drawRectangle({ x: footerX, y: footerTop - 48, width: footerWidths[index], height: 48, borderColor: GRID, borderWidth: 0.6 });
        page.drawText(label, { x: footerX + 6, y: footerTop - 12, size: RECEIPT_FONT_SIZE, font: bold, color: INK });
        page.drawText("Signature / Printed Name / Date", { x: footerX + 6, y: footerTop - 40, size: RECEIPT_FONT_SIZE, font: regular, color: MUTED });
      });
      break;
    }
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${drNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
