import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import sharp from "sharp";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getDashboardKpis, getDashboardMasterInventory } from "@/lib/db/queries/dashboard";

const PAGE_WIDTH = 841.89; // A4 Landscape
const PAGE_HEIGHT = 595.28;
const MARGIN = 28;
const INK = rgb(0.07, 0.1, 0.16);
const MUTED = rgb(0.39, 0.46, 0.58);
const GRID = rgb(0.75, 0.8, 0.88);
const HEADER_FILL = rgb(0.92, 0.95, 0.98);
const ACCENT_NAVY = rgb(0.0, 0.17, 0.29);

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
  align: "left" | "center" | "right" = "left",
  fillColor?: ReturnType<typeof rgb>
) {
  page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    borderColor: GRID,
    borderWidth: 0.5,
    color: fillColor,
  });

  const lines = wrapText(value, font, size, width - 8);
  const lineHeight = size + 2;
  const textBlockHeight = (lines.length - 1) * lineHeight + size;
  const startY = top - (height - textBlockHeight) / 2 - size;

  lines.slice(0, 2).forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    let drawX = x + 4;
    if (align === "center") {
      drawX = x + (width - lineWidth) / 2;
    } else if (align === "right") {
      drawX = x + width - lineWidth - 4;
    }
    page.drawText(line, {
      x: drawX,
      y: startY - index * lineHeight,
      size,
      font,
      color: INK,
    });
  });
}

export async function GET() {
  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();
  if (resolution.kind !== "authorized") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const perm = await requirePermission(resolver, "reporting.read");
  if (perm.kind !== "authorized") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const [kpiData, inventoryData] = await Promise.all([
    getDashboardKpis(),
    getDashboardMasterInventory({ limit: 50 }),
  ]);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Logo insertion if available
  try {
    const logoSvg = await readFile(path.join(process.cwd(), "public", "logo.svg"), "utf8");
    const logoPng = await sharp(Buffer.from(logoSvg)).png().toBuffer();
    const logo = await pdf.embedPng(logoPng);
    page.drawImage(logo, { x: MARGIN, y: 520, width: 34, height: 34 });
  } catch {
    // Fallback if logo not found
  }

  const headerX = MARGIN + 44;
  page.drawText("DYNA-SERV GLOBAL CORPORATION", { x: headerX, y: 542, size: 14, font: bold, color: ACCENT_NAVY });
  page.drawText("Warehouse Operations & Master Inventory Executive Summary Report", { x: headerX, y: 526, size: 9, font: bold, color: MUTED });

  const nowStr = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  page.drawText(`GENERATED: ${nowStr}`, { x: 620, y: 542, size: 8, font: bold, color: INK });
  page.drawText(`STATUS: AUTHORIZED REAL-TIME TELEMETRY`, { x: 620, y: 528, size: 7, font: regular, color: MUTED });

  // Top KPI Summary Cards in PDF
  const kpiY = 506;
  const cardW = (PAGE_WIDTH - MARGIN * 2 - 24) / 4;
  const cards = [
    {
      title: "TOTAL INVENTORY VALUATION",
      value: `$${kpiData.valuation.total.toLocaleString()}`,
      sub: `VMI: $${(kpiData.valuation.vmiAmount / 1000000).toFixed(1)}M | Trading: $${(kpiData.valuation.tradingAmount / 1000).toFixed(0)}K`,
    },
    {
      title: "ACTIVE QUEUES & WRRs",
      value: `${kpiData.floorQueues.activePickLists} Picks / ${kpiData.floorQueues.pendingReceivingWrrs} WRRs`,
      sub: `${kpiData.floorQueues.pendingQcInspections} QC Inspections Pending`,
    },
    {
      title: "STOCK HEALTH & RISKS",
      value: `${kpiData.stockHealth.lowStockCount} Low Stock`,
      sub: `${kpiData.stockHealth.heldLotsCount} Quarantined Lots | ${kpiData.stockHealth.qcPassRatePct}% QC`,
    },
    {
      title: "SETTLEMENT & BILLING MTD",
      value: `$${kpiData.financialSummary.pendingBillingAmount.toLocaleString()}`,
      sub: `${kpiData.financialSummary.pendingInvoicesCount} Invoices | Margin: ${kpiData.financialSummary.tradingMarginPct}%`,
    },
  ];

  cards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 8);
    page.drawRectangle({
      x: cx,
      y: kpiY - 44,
      width: cardW,
      height: 44,
      color: HEADER_FILL,
      borderColor: GRID,
      borderWidth: 0.6,
    });
    page.drawText(card.title, { x: cx + 6, y: kpiY - 12, size: 6.5, font: bold, color: ACCENT_NAVY });
    page.drawText(card.value, { x: cx + 6, y: kpiY - 26, size: 10, font: bold, color: INK });
    page.drawText(card.sub, { x: cx + 6, y: kpiY - 38, size: 6.5, font: regular, color: MUTED });
  });

  // Table Section Header
  const tableTitleY = 448;
  page.drawText("LIVE MASTER INVENTORY POSITIONS & BALANCES", { x: MARGIN, y: tableTitleY, size: 9, font: bold, color: ACCENT_NAVY });

  const headings = ["ITEM CODE", "DESCRIPTION", "FLOW", "VENDOR / PARTY", "AVAILABLE QTY", "REORDER LVL", "STATUS", "LOCATION"];
  const widths = [85, 210, 50, 150, 90, 75, 65, 60.89];
  let x = MARGIN;
  const colHeaderY = tableTitleY - 8;

  headings.forEach((heading, index) => {
    drawCell(page, heading, x, colHeaderY, widths[index], 20, bold, 6.5, index >= 4 && index <= 5 ? "right" : index === 2 || index === 6 ? "center" : "left", HEADER_FILL);
    x += widths[index];
  });

  let rowTop = colHeaderY - 20;
  const rows = inventoryData.items.slice(0, 14);

  for (const item of rows) {
    x = MARGIN;
    const values = [
      item.itemCode,
      item.description,
      item.flowType.toUpperCase(),
      item.partyName,
      `${item.availableQty.toLocaleString()} ${item.uom}`,
      `${item.reorderLevel.toLocaleString()} ${item.uom}`,
      item.status === "available" ? "AVAILABLE" : item.status === "low_stock" ? "LOW STOCK" : "HELD",
      item.primaryLocation,
    ];

    values.forEach((value, col) => {
      drawCell(
        page,
        value,
        x,
        rowTop,
        widths[col],
        18,
        col === 0 ? bold : regular,
        6.5,
        col >= 4 && col <= 5 ? "right" : col === 2 || col === 6 ? "center" : "left"
      );
      x += widths[col];
    });

    rowTop -= 18;
  }

  // Footer & Signatures
  const footerY = 56;
  page.drawLine({ start: { x: MARGIN, y: footerY + 16 }, end: { x: PAGE_WIDTH - MARGIN, y: footerY + 16 }, thickness: 0.8, color: GRID });
  page.drawText("Confidential — Dyna-Serv WIMS Operations Report. Retention: Permanent hot/cold archival.", {
    x: MARGIN,
    y: footerY + 4,
    size: 6.5,
    font: regular,
    color: MUTED,
  });

  const sigW = 160;
  page.drawText("PREPARED BY / WAREHOUSE SUPERVISOR:", { x: PAGE_WIDTH - MARGIN - sigW * 2 - 20, y: footerY + 4, size: 6.5, font: bold, color: INK });
  page.drawLine({ start: { x: PAGE_WIDTH - MARGIN - sigW * 2 - 20, y: footerY - 14 }, end: { x: PAGE_WIDTH - MARGIN - sigW - 30, y: footerY - 14 }, thickness: 0.6, color: INK });

  page.drawText("VERIFIED BY / INVENTORY CONTROLLER:", { x: PAGE_WIDTH - MARGIN - sigW, y: footerY + 4, size: 6.5, font: bold, color: INK });
  page.drawLine({ start: { x: PAGE_WIDTH - MARGIN - sigW, y: footerY - 14 }, end: { x: PAGE_WIDTH - MARGIN, y: footerY - 14 }, thickness: 0.6, color: INK });

  const bytes = await pdf.save();
  const dateTag = new Date().toISOString().slice(0, 10);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="wms-operations-inventory-report-${dateTag}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
