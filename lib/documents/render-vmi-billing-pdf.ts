import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { VmiDocumentType } from "./vmi-artifacts";

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

const WIDTH = 612;
const HEIGHT = 792;
const LEFT = 42;
const RIGHT = WIDTH - 42;

function money(value: number): string { return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function line(page: PDFPage, y: number): void { page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: rgb(0.75, 0.78, 0.82) }); }
function text(page: PDFPage, content: string, x: number, y: number, font: PDFFont, size = 9, bold = false): void { page.drawText(content, { x, y, font, size, color: bold ? rgb(0.06, 0.12, 0.24) : rgb(0.12, 0.15, 0.2) }); }

function header(page: PDFPage, title: string, period: VmiPdfPeriod, regular: PDFFont, bold: PDFFont): number {
  text(page, "DYNA-SERV WAREHOUSE MANAGEMENT", LEFT, 755, bold, 13, true);
  text(page, title.toUpperCase(), LEFT, 731, bold, 16, true);
  text(page, `${period.partyName} (${period.partyCode})`, LEFT, 708, regular, 10);
  text(page, `Reference: ${period.periodNumber}`, LEFT, 693, regular, 9);
  text(page, `Billing period: ${period.periodStartDate} to ${period.periodEndDate}`, LEFT, 679, regular, 9);
  line(page, 668);
  return 646;
}

function row(page: PDFPage, y: number, label: string, value: string, regular: PDFFont, bold: PDFFont, strong = false): number {
  text(page, label, LEFT, y, strong ? bold : regular, 10, strong);
  text(page, value, RIGHT - bold.widthOfTextAtSize(value, 10), y, strong ? bold : regular, 10, strong);
  return y - 22;
}

export async function renderVmiBillingPdf(type: VmiDocumentType, data: VmiPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([WIDTH, HEIGHT]);
  let y = header(page, {
    vmi_billing_statement: "Billing Statement",
    vmi_warehousing_charges: "Warehousing Charges",
    vmi_statement_of_account: "Statement of Account",
    vmi_letter_of_authority: "Letter of Authority",
  }[type], data.period, regular, bold);

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
    text(page, `Locked FX rate: 1 USD = PHP ${data.period.lockedExchangeRatePhp.toFixed(4)}`, LEFT, y, regular, 9);
    y -= 28;
    text(page, "Payment history", LEFT, y, bold, 11, true); y -= 18;
    for (const payment of data.payments) {
      text(page, `${payment.date} · ${payment.type}${payment.notes ? ` · ${payment.notes}` : ""}`, LEFT, y, regular, 9);
      const amount = money(payment.amountUsd); text(page, amount, RIGHT - bold.widthOfTextAtSize(amount, 9), y, bold, 9); y -= 16;
    }
    if (data.payments.length === 0) text(page, "No payments recorded for this period.", LEFT, y, regular, 9);
  } else if (type === "vmi_letter_of_authority") {
    text(page, "Active permit details for the billing period", LEFT, y, regular, 10); y -= 28;
    if (data.permits.length === 0) text(page, "No active permit records were found.", LEFT, y, regular, 10);
    for (const permit of data.permits) {
      text(page, permit.permitNumber, LEFT, y, bold, 10, true); y -= 15;
      text(page, `Scope: ${permit.itemScope}`, LEFT, y, regular, 9); y -= 14;
      text(page, `Validity: ${permit.validFrom} to ${permit.validTo} · Monthly fee: ${money(permit.monthlyFeeUsd)}`, LEFT, y, regular, 9); y -= 24;
    }
  } else {
    const headings = ["Date", "Beginning", "In", "Out", "Ending", "Rate", "Amount"];
    const x = [LEFT, 110, 185, 245, 305, 380, 455];
    headings.forEach((heading, index) => text(page, heading, x[index], y, bold, 8, true)); y -= 12; line(page, y + 5);
    for (const daily of data.dailyRows) {
      if (y < 65) { page = pdf.addPage([WIDTH, HEIGHT]); y = header(page, "Warehousing Charges (continued)", data.period, regular, bold); }
      const values = [daily.date, daily.beginningCbm.toFixed(2), daily.inboundCbm.toFixed(2), daily.outboundCbm.toFixed(2), daily.endingCbm.toFixed(2), `$${daily.rateUsd.toFixed(4)}`, money(daily.amountUsd)];
      values.forEach((value, index) => text(page, value, x[index], y, regular, 8)); y -= 15;
    }
    line(page, y + 5); text(page, "Storage charge total", LEFT, y - 12, bold, 10, true); const total = money(data.period.storageChargeUsd); text(page, total, RIGHT - bold.widthOfTextAtSize(total, 10), y - 12, bold, 10);
  }

  text(page, `Generated draft preview · ${data.period.periodNumber}`, LEFT, 30, regular, 8);
  return pdf.save();
}
