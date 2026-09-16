import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { parties } from "@/lib/db/schema/parties";
import { vmiPermits } from "@/lib/db/schema/vmi_billing";
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

  const lines = wrapText(text, font, size, width - 6);
  const lineHeight = size + 2;
  const blockHeight = lines.length * lineHeight;
  const startY = yTop - (height - blockHeight) / 2 - size;

  lines.slice(0, 3).forEach((line, index) => {
    const textWidth = font.widthOfTextAtSize(line, size);
    const textX = align === "center" ? x + (width - textWidth) / 2 : x + 3;
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
      .from(parties).where(eq(parties.id, pickList.customerPartyId)).limit(1),
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

  let logoImage: any = null;
  try {
    const logoPng = await readFile(path.join(process.cwd(), "public", "logo-hd.png"));
    logoImage = await pdf.embedPng(logoPng);
  } catch {
    // Fallback if logo file is not found
  }

  const nonNullPickList = pickList;
  const headings = ["NO.", "QTY", "SPQ", "NO. OF BOXES", "ITEM CODE", "CUST PN", "ITEM DESCRIPTION", "LOT NUMBER", "PO NUMBER", "INVOICE NO.", "REMARKS", "LOCATION"];
  const widths = [26, 42, 36, 54, 80, 64, 126, 76, 60, 60, 66, 95.89];

  // Helper to draw standard document header & table header
  function renderDocumentHeader(page: PDFPage, pageNum: number, totalPages: number): number {
    if (logoImage) {
      page.drawImage(logoImage, { x: MARGIN, y: 520, width: 34, height: 34 });
    }
    const headerX = MARGIN + (logoImage ? 44 : 0);
    page.drawText("ACKNOWLEDGEMENT RECEIPT", { x: headerX, y: 540, size: 14, font: bold, color: INK });
    page.drawText("DYNA-SERV GLOBAL CORPORATION — WAREHOUSE MANAGEMENT SYSTEM", { x: headerX, y: 526, size: 7.5, font: bold, color: MUTED });

    const meta = [
      ["DELIVERY RECEIPT NO.", drNumber],
      ["PICK LIST NO.", nonNullPickList.pickListNumber],
      ["PEZA PERMIT NO.", pezaPermitNo || "—"],
      ["DELIVERY DATE", nonNullPickList.createdAt.toLocaleDateString()],
    ];
    meta.forEach(([label, value], index) => {
      page.drawText(label, { x: 580, y: 544 - index * 12, size: 7, font: bold, color: INK });
      page.drawText(value, { x: 705, y: 544 - index * 12, size: 7, font: bold, color: INK });
    });

    if (totalPages > 1) {
      page.drawText(`PAGE ${pageNum} OF ${totalPages}`, { x: 730, y: 562, size: 7, font: bold, color: MUTED });
    }

    page.drawText("DELIVERY TO (CUSTOMER):", { x: MARGIN, y: 486, size: 7.5, font: bold, color: INK });
    page.drawText(party?.name ?? nonNullPickList.customerPartyId, { x: MARGIN, y: 474, size: 8.5, font: bold, color: INK });
    page.drawText([party?.address1, party?.address2].filter(Boolean).join(", ") || "Address on file", { x: MARGIN, y: 462, size: 7.5, font: regular, color: MUTED });
    page.drawText(`Inventory Model: ${nonNullPickList.flowType.toUpperCase()}`, { x: 630, y: 474, size: 7.5, font: bold, color: INK });
    page.drawLine({ start: { x: MARGIN, y: 450 }, end: { x: PAGE_WIDTH - MARGIN, y: 450 }, thickness: 1, color: GRID });

    // Table Column Headers
    let x = MARGIN;
    headings.forEach((heading, index) => {
      drawCell(page, heading, x, 442, widths[index], 22, bold, 6.5, "center", HEADER_FILL);
      x += widths[index];
    });

    return 420; // returns top Y coordinate for line items
  }

  const ROW_HEIGHT = 18;
  const FOOTER_REQUIRED_SPACE = 135; // Total row (20) + Delivery Remarks (46) + Signatures (56) + margins
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
      const values = [
        String(globalIndex + 1),
        line.qty.toLocaleString(),
        line.spq.toLocaleString(),
        line.numberOfBoxes.toLocaleString(),
        line.itemCode,
        line.customerItemCode ?? "—",
        line.itemDescription ?? "—",
        line.lotNumber,
        "—",
        "—",
        "—",
        line.locationLabel,
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
          6.5,
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
      ["TOTAL", totalQty.toLocaleString(), "—", totalBoxes.toLocaleString(), "", "", "", "", "", "", "", ""].forEach((value, column) => {
        drawCell(page, value, x, rowTop, widths[column], 20, bold, 7, column < 4 ? "center" : "left", HEADER_FILL);
        x += widths[column];
      });

      // Delivery Remarks Box
      const instructionTop = rowTop - 20 - 10;
      page.drawRectangle({ x: MARGIN, y: instructionTop - 36, width: CONTENT_WIDTH, height: 36, borderColor: GRID, borderWidth: 0.6 });
      page.drawRectangle({ x: MARGIN, y: instructionTop - 14, width: CONTENT_WIDTH, height: 14, color: HEADER_FILL, borderColor: GRID, borderWidth: 0.6 });
      page.drawText("DELIVERY INSTRUCTIONS / REMARKS", { x: MARGIN + 6, y: instructionTop - 10, size: 6.5, font: bold, color: INK });
      page.drawText("Goods delivered in good condition. Certified under ISO 9001:2015 Dyna-Serv logistics standard.", { x: MARGIN + 6, y: instructionTop - 26, size: 7, font: regular, color: MUTED });

      // Triple Sign-Off Footer
      const footerTop = instructionTop - 46;
      const footerWidths = [CONTENT_WIDTH / 3, CONTENT_WIDTH / 3, CONTENT_WIDTH / 3];
      ["CHECKED & VERIFIED BY:", "LOADED & DISPATCHED BY:", "ACKNOWLEDGED & RECEIVED BY:"].forEach((label, index) => {
        const footerX = MARGIN + footerWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
        page.drawRectangle({ x: footerX, y: footerTop - 48, width: footerWidths[index], height: 48, borderColor: GRID, borderWidth: 0.6 });
        page.drawText(label, { x: footerX + 6, y: footerTop - 12, size: 6.5, font: bold, color: INK });
        page.drawText("Signature / Printed Name / Date", { x: footerX + 6, y: footerTop - 40, size: 6, font: regular, color: MUTED });
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
