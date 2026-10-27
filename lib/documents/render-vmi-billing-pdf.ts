import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";
import type { VmiDocumentType } from "./vmi-artifacts";
import { PDF_FONT_SIZE, PDF_PAGE, PDF_THEME } from "./pdf-theme";
import { DEFAULT_DOCUMENT_TEMPLATE, type DocumentTemplate } from "./document-template";

export type VmiPdfPeriod = {
  periodNumber: string;
  partyName: string;
  partyCode: string;
  periodStartDate: string;
  periodEndDate: string;
  storageChargeUsd: number;
  handlingInUsd: number;
  handlingOutUsd: number;
  documentationUsd: number;
  deliveryUsd: number;
  recurringFeesUsd: number;
  adHocChargesUsd: number;
  creditsAppliedUsd: number;
  billingStatementTotalUsd: number;
  soaOpeningBalanceUsd: number;
  soaPaymentsAppliedUsd: number;
  soaClosingBalanceUsd: number;
  lockedExchangeRatePhp: number;
};

export type VmiPdfDailyRow = { date: string; beginningCbm: number; inboundCbm: number; outboundCbm: number; endingCbm: number; rateUsd: number; amountUsd: number };
export type VmiPdfPayment = { date: string; type: string; amountUsd: number; notes?: string | null };
export type VmiPdfPermit = { permitNumber: string; itemScope: string; validFrom: string; validTo: string; monthlyFeeUsd: number };

export type VmiPdfData = { period: VmiPdfPeriod; dailyRows: VmiPdfDailyRow[]; payments: VmiPdfPayment[]; permits: VmiPdfPermit[] };

const { width: WIDTH, height: HEIGHT } = PDF_PAGE.portrait;
const LEFT = PDF_THEME.margin + 14;
const RIGHT = WIDTH - 42;

function money(value: number): string { return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function line(page: PDFPage, y: number): void { page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: PDF_THEME.grid }); }
function text(page: PDFPage, content: string, x: number, y: number, font: PDFFont, _size = PDF_FONT_SIZE, bold = false): void { page.drawText(content, { x, y, font, size: PDF_FONT_SIZE, color: bold ? PDF_THEME.accentNavy : PDF_THEME.ink }); }

async function embedDynaServLogo(pdf: PDFDocument, template: DocumentTemplate): Promise<PDFImage> {
  const logoPath = template.logoUrl?.startsWith("/") ? template.logoUrl.slice(1) : "logo-hd.png";
  const logoPng = await readFile(path.join(process.cwd(), "public", logoPath));
  return pdf.embedPng(logoPng);
}

function header(page: PDFPage, title: string, period: VmiPdfPeriod, regular: PDFFont, bold: PDFFont, logo: PDFImage, template: DocumentTemplate): number {
  const logoSize = 32;
  page.drawImage(logo, { x: LEFT, y: 744 - logoSize, width: logoSize, height: logoSize });
  const textLeft = LEFT + logoSize + 10;
  text(page, template.companyName, textLeft, 755, bold, PDF_FONT_SIZE, true);
  text(page, template.subtitle, textLeft, 741, regular, PDF_FONT_SIZE);
  text(page, title.toUpperCase(), LEFT, 698, bold, 12, true);
  text(page, `${period.partyName} (${period.partyCode})`, LEFT, 679, regular, PDF_FONT_SIZE);
  text(page, `Reference: ${period.periodNumber}`, LEFT, 664, regular, PDF_FONT_SIZE);
  text(page, `Billing period: ${period.periodStartDate} to ${period.periodEndDate}`, LEFT, 650, regular, PDF_FONT_SIZE);
  line(page, 637);
  return 615;
}

function row(page: PDFPage, y: number, label: string, value: string, regular: PDFFont, bold: PDFFont, strong = false): number {
  text(page, label, LEFT, y, strong ? bold : regular, PDF_FONT_SIZE, strong);
  text(page, value, RIGHT - bold.widthOfTextAtSize(value, PDF_FONT_SIZE), y, strong ? bold : regular, PDF_FONT_SIZE, strong);
  return y - 22;
}

export async function renderVmiBillingPdf(type: VmiDocumentType, data: VmiPdfData, template: DocumentTemplate = DEFAULT_DOCUMENT_TEMPLATE): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedDynaServLogo(pdf, template);
  let page = pdf.addPage([WIDTH, HEIGHT]);
  let y = header(page, {
    vmi_billing_statement: "Billing Statement",
    vmi_warehousing_charges: "Warehousing Charges",
    vmi_statement_of_account: "Statement of Account",
    vmi_letter_of_authority: "Letter of Authority",
  }[type], data.period, regular, bold, logo, template);

  if (type === "vmi_billing_statement") {
    const rows: [string, number][] = [
      ["Storage charges", data.period.storageChargeUsd], ["Handling — inbound", data.period.handlingInUsd], ["Handling — outbound", data.period.handlingOutUsd], ["Documentation", data.period.documentationUsd], ["Delivery", data.period.deliveryUsd], ["Recurring fees", data.period.recurringFeesUsd], ["Ad-hoc charges", data.period.adHocChargesUsd], ["Credits applied", -data.period.creditsAppliedUsd],
    ];
    for (const [label, amount] of rows) y = row(page, y, label, money(amount), regular, bold);
    line(page, y + 8);
    row(page, y - 12, "Billing Statement Total", money(data.period.billingStatementTotalUsd), regular, bold, true);
  } else if (type === "vmi_statement_of_account") {
    y = row(page, y, "Opening balance", money(data.period.soaOpeningBalanceUsd), regular, bold);
    y = row(page, y, "Current billing statement", money(data.period.billingStatementTotalUsd), regular, bold);
    y = row(page, y, "Payments applied", money(-data.period.soaPaymentsAppliedUsd), regular, bold);
    line(page, y + 8);
    y = row(page, y - 12, "Closing balance", money(data.period.soaClosingBalanceUsd), regular, bold, true);
    y -= 14;
    text(page, `Locked FX rate: 1 USD = PHP ${data.period.lockedExchangeRatePhp.toFixed(4)}`, LEFT, y, regular, PDF_FONT_SIZE);
    y -= 28;
    text(page, "Payment history", LEFT, y, bold, PDF_FONT_SIZE, true); y -= 18;
    for (const payment of data.payments) {
      if (y < 65) {
        page = pdf.addPage([WIDTH, HEIGHT]);
        y = header(page, "Statement of Account (continued)", data.period, regular, bold, logo, template);
        text(page, "Payment history (continued)", LEFT, y, bold, PDF_FONT_SIZE, true);
        y -= 18;
      }
      text(page, `${payment.date} · ${payment.type}${payment.notes ? ` · ${payment.notes}` : ""}`, LEFT, y, regular, PDF_FONT_SIZE);
      const amount = money(payment.amountUsd);
      text(page, amount, RIGHT - bold.widthOfTextAtSize(amount, PDF_FONT_SIZE), y, bold, PDF_FONT_SIZE);
      y -= 16;
    }
    if (data.payments.length === 0) text(page, "No payments recorded for this period.", LEFT, y, regular, PDF_FONT_SIZE);
  } else if (type === "vmi_letter_of_authority") {
    text(page, "Active permit details for the billing period", LEFT, y, regular, PDF_FONT_SIZE); y -= 28;
    if (data.permits.length === 0) text(page, "No active permit records were found.", LEFT, y, regular, PDF_FONT_SIZE);
    for (const permit of data.permits) {
      text(page, permit.permitNumber, LEFT, y, bold, PDF_FONT_SIZE, true); y -= 15;
      text(page, `Scope: ${permit.itemScope}`, LEFT, y, regular, PDF_FONT_SIZE); y -= 14;
      text(page, `Validity: ${permit.validFrom} to ${permit.validTo} · Monthly fee: ${money(permit.monthlyFeeUsd)}`, LEFT, y, regular, PDF_FONT_SIZE); y -= 24;
    }
  } else {
    const headings = ["Date", "Beginning", "In", "Out", "Ending", "Rate", "Amount"];
    const x = [LEFT, 110, 185, 245, 305, 380, 455];
    headings.forEach((heading, index) => text(page, heading, x[index], y, bold, PDF_FONT_SIZE, true)); y -= 12; line(page, y + 5);
    for (const daily of data.dailyRows) {
      if (y < 65) { page = pdf.addPage([WIDTH, HEIGHT]); y = header(page, "Warehousing Charges (continued)", data.period, regular, bold, logo, template); }
      const values = [daily.date, daily.beginningCbm.toFixed(2), daily.inboundCbm.toFixed(2), daily.outboundCbm.toFixed(2), daily.endingCbm.toFixed(2), `$${daily.rateUsd.toFixed(4)}`, money(daily.amountUsd)];
      values.forEach((value, index) => text(page, value, x[index], y, regular, PDF_FONT_SIZE)); y -= 15;
    }
    line(page, y + 5); text(page, "Storage charge total", LEFT, y - 12, bold, PDF_FONT_SIZE, true); const total = money(data.period.storageChargeUsd); text(page, total, RIGHT - bold.widthOfTextAtSize(total, PDF_FONT_SIZE), y - 12, bold, PDF_FONT_SIZE);
  }

  text(page, `Generated draft preview · ${data.period.periodNumber}`, LEFT, 30, regular, PDF_FONT_SIZE);
  return pdf.save();
}
