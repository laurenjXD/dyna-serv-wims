"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, ChevronDown, ChevronUp, FileText } from "lucide-react";

export interface SoaCategory {
  name: string;
  code: string;
  amount: number;
  sectionId: string;
}

export interface SoaData {
  soaNumber: string;
  customerName: string;
  customerCode: string;
  customerAddress: string;
  contractNumber: string;
  billingPeriod: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  openingBalanceUsd: number;
  currentChargesUsd: number;
  debitAdjustmentsUsd: number;
  creditsUsd: number;
  paymentsAppliedUsd: number;
  outstandingBalanceUsd: number;
  categories: SoaCategory[];
}

interface SoaDetailClientProps {
  soaData: SoaData;
}

// ── Appendix row types ─────────────────────────────────────────────────────────

interface DailyStorageRow {
  date: string;
  beg: number;
  inFg: number;
  inRaw: number;
  outFg: number;
  outRaw: number;
  end: number;
  rate: number;
  amount: number;
}

interface DeliveryRow {
  date: string;
  dr: string;
  consignee: string;
  delCharge: number;
  docCharge: number;
  remarks: string;
}

interface LoaRow {
  permit: string;
  scope: string;
  validFrom: string;
  validTo: string;
  rate: number;
}

interface OtherChargeRow {
  name: string;
  code: string;
  amount: number;
  notes: string;
}

interface ManpowerRow {
  role: string;
  hours: number;
  rate: number;
  amount: number;
  notes: string;
}

// ── Demo stubs (replace with real DB queries later) ────────────────────────────

const DEMO_DELIVERY_ROWS: DeliveryRow[] = [
  { date: "2026-06-03", dr: "DR-2026-0601", consignee: "UPI — Cavite Assembly Plant A", delCharge: 85.00, docCharge: 60.00, remarks: "Regular run, 2 pallets" },
  { date: "2026-06-07", dr: "DR-2026-0612", consignee: "UPI — Calamba Storage Hub", delCharge: 72.50, docCharge: 60.00, remarks: "Co-load with DR-0614" },
  { date: "2026-06-14", dr: "DR-2026-0625", consignee: "UPI — Cavite Assembly Plant A", delCharge: 92.00, docCharge: 60.00, remarks: "Priority rush delivery" },
  { date: "2026-06-21", dr: "DR-2026-0638", consignee: "UPI — Manila Bonded Warehouse", delCharge: 78.21, docCharge: 60.00, remarks: "Standard run" },
  { date: "2026-06-28", dr: "DR-2026-0649", consignee: "UPI — Cavite Assembly Plant A", delCharge: 95.00, docCharge: 60.00, remarks: "End-of-month closeout" },
  { date: "2026-06-30", dr: "DR-2026-0654", consignee: "UPI — Calamba Storage Hub", delCharge: 90.00, docCharge: 60.00, remarks: "Final June run" },
  { date: "2026-06-30", dr: "DR-2026-0658", consignee: "UPI — Cavite Assembly Plant A", delCharge: 150.00, docCharge: 60.00, remarks: "Bulk consolidated delivery" },
];

const DEMO_LOA_ROWS: LoaRow[] = [
  { permit: "LOA-2026-887", scope: "PEZA Economic Zone Access — Zone 4 (Biñan)", validFrom: "2026-01-01", validTo: "2026-12-31", rate: 18.00 },
  { permit: "LOA-2026-888", scope: "Bureau of Customs Bonded Warehouse Authority", validFrom: "2026-01-01", validTo: "2026-12-31", rate: 18.00 },
  { permit: "LOA-2026-889", scope: "PEZA Duty-Free Tax Exemption Permit", validFrom: "2026-01-01", validTo: "2026-12-31", rate: 36.00 },
];

const DEMO_OTHER_CHARGES: OtherChargeRow[] = [
  { name: "Trucking Administrative Fee", code: "TRUCK-ADMIN", amount: 200.00, notes: "Monthly fleet scheduling and POD archiving fee" },
  { name: "Surety Bond Fee", code: "SURETY-BOND", amount: 0.00, notes: "Waived under Contract DSGC-VMI-2026-001" },
  { name: "Container Transfer Fee (CTF)", code: "CTF-FEE", amount: 0.00, notes: "No container transfers logged for June 2026" },
];

const DEMO_MANPOWER_ROWS: ManpowerRow[] = [
  { role: "Receiving and Stripping Team", hours: 44.01, rate: 5.00, amount: 220.05, notes: "WRR Inbound Stripping (44.01 hrs @ USD5/hr)" },
  { role: "Picking and Loading Team", hours: 73.63, rate: 5.00, amount: 368.14, notes: "Outbound Pick and Staging (73.63 hrs @ USD5/hr)" },
];

function buildDemoCbmRows(): DailyStorageRow[] {
  const rows: DailyStorageRow[] = [];
  let beg = 714.22;
  const rate = 0.05;
  for (let d = 1; d <= 30; d++) {
    const date = `2026-06-${String(d).padStart(2, "0")}`;
    const inFg = [3, 10, 17, 24].includes(d) ? 12.40 : 0;
    const inRaw = [5, 15, 25].includes(d) ? 8.80 : 0;
    const outFg = [7, 14, 21, 28].includes(d) ? 10.20 : 0;
    const outRaw = [8, 22].includes(d) ? 6.60 : 0;
    const end = +(beg + inFg + inRaw - outFg - outRaw).toFixed(2);
    const amount = +(end * rate).toFixed(2);
    rows.push({ date, beg, inFg, inRaw, outFg, outRaw, end, rate, amount });
    beg = end;
  }
  return rows;
}

const DEMO_CBM_ROWS = buildDemoCbmRows();

// ── Utilities ──────────────────────────────────────────────────────────────────

function usd(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AppendixSection({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <div id={id} className="mt-6">
      <h3 className="font-mono text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">
        {title}
      </h3>
      <div className="border border-slate-300 overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

function AppendixTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-left border-collapse font-mono text-xs">
      <thead>
        <tr className="bg-slate-100 border-b border-slate-300">
          {headers.map((h) => (
            <th key={h} className="py-1.5 px-3 uppercase tracking-wider text-slate-700 font-bold whitespace-nowrap text-xs">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      {children}
    </table>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function SoaDetailClient({ soaData }: SoaDetailClientProps) {
  const [showAppendix, setShowAppendix] = useState(false);

  const chargeLines = [
    { label: "Warehousing Charge", amount: soaData.categories.find((c) => c.sectionId === "section-7")?.amount ?? 0 },
    { label: "Documentation", amount: soaData.categories.find((c) => c.code === "DOC-FEE")?.amount ?? 420.00 },
    { label: "Delivery Charge", amount: soaData.categories.find((c) => c.sectionId === "section-2")?.amount ?? 0 },
    { label: "Handling and Stripping", amount: soaData.categories.find((c) => c.sectionId === "section-5")?.amount ?? 0 },
    { label: "Cargo Transfer Fee", amount: 0 },
    { label: "RTV", amount: 0 },
    { label: "Admin Fee", amount: soaData.categories.find((c) => c.code === "TRUCK-ADMIN")?.amount ?? 200.00 },
    { label: "Insurance", amount: 0 },
    { label: "Man Power (Permits and Special Handling)", amount: soaData.categories.find((c) => c.sectionId === "section-3")?.amount ?? 36.00 },
  ];

  const grandTotal = chargeLines.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 print:p-0 print:m-0 print:max-w-none">

      {/* ── Print stylesheet ─────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 14mm 14mm 14mm; }
          html, body {
            background: #fff !important;
            color: #000 !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            font-size: 9.5pt !important;
            line-height: 1.35 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .print-page-break { break-before: page !important; page-break-before: always !important; }
          .print-avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
          table { border-collapse: collapse !important; width: 100% !important; }
          thead { display: table-header-group !important; }
          tr { page-break-inside: avoid !important; }
          th { background: #f1f5f9 !important; color: #000 !important; border: 1px solid #475569 !important; padding: 3px 5px !important; font-weight: 700 !important; font-size: 8pt !important; }
          td { border: 1px solid #cbd5e1 !important; padding: 3px 5px !important; color: #000 !important; font-size: 8.5pt !important; }
          th[style], td[style] { border: 1px solid #475569 !important; }
          .soa-main-header { background: #1e293b !important; }
          .soa-main-header th { background: #1e293b !important; color: #ffffff !important; }
          .soa-grand-total td { background: #e2e8f0 !important; font-weight: 800 !important; }
          .soa-total-row td { background: #f1f5f9 !important; font-weight: 700 !important; }
        }
      `}</style>

      {/* ── Screen action bar ────────────────────────────────────────────── */}
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <Link href="/billing-pricing" className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600">
            <ArrowLeft size={14} className="mr-1" /> Back to Billing
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            Statement of Account &mdash; {soaData.soaNumber}
          </h1>
          <p className="text-sm text-slate-500">
            {soaData.customerName} &bull; {soaData.billingPeriod}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Printer size={14} /> Print SOA
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
          >
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          PRINTABLE DOCUMENT
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-slate-300 p-10 print:p-0 print:border-none shadow-sm">

        {/* Letterhead */}
        <div className="flex items-start justify-between gap-4 pb-5 border-b-2 border-slate-800 print-avoid-break">
          <div>
            <p className="text-xl font-extrabold tracking-tight text-slate-900 leading-tight">
              DYNA-SERV GLOBAL CORPORATION
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Unit 7, Orient Goldcrest Building 6A, 149 East Main Avenue Loop, Phase 6C<br />
              Laguna Technopark SEZ, Biñan City, Laguna, Philippines 4024
            </p>
            <p className="text-xs text-blue-700 font-semibold mt-0.5">
              www.dyna-serv.com.ph
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">
              Statement of Account
            </p>
            <table className="mt-2 ml-auto text-xs" style={{borderCollapse:"collapse"}}>
              <tbody>
                {[
                  ["SOA No.", soaData.soaNumber],
                  ["Invoice Date", soaData.issueDate],
                  ["Payment Due", soaData.dueDate],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td className="pr-4 py-0.5 text-slate-500 text-right" style={{border:"none"}}>{label}</td>
                    <td className="font-mono font-bold text-slate-900" style={{border:"none"}}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bill To / Document Details */}
        <div className="grid grid-cols-2 gap-10 mt-5 text-xs print-avoid-break">
          <div>
            <p className="font-bold uppercase tracking-widest text-slate-400 text-[9px] mb-1.5">Bill To</p>
            <p className="font-bold text-slate-900 text-sm">{soaData.customerName}</p>
            <p className="text-slate-500 mt-1 whitespace-pre-line leading-relaxed">
              {soaData.customerAddress || "Unit 8, 35/F Cable TV Tower\n9 Hoi Shing Road, Tsuen Wan NT, HK"}
            </p>
            <p className="text-slate-500 mt-1">Attn: Accounts Payable / Supply Chain Dept.</p>
          </div>
          <div>
            <p className="font-bold uppercase tracking-widest text-slate-400 text-[9px] mb-1.5">Document Details</p>
            <table className="w-full text-xs" style={{borderCollapse:"collapse"}}>
              <tbody>
                {[
                  ["Billing Period", `${soaData.billingPeriodStart} – ${soaData.billingPeriodEnd}`],
                  ["Reference", soaData.contractNumber],
                  ["Terms", "Net 30 Days"],
                  ["Currency", "USD"],
                  ["Forex Rate", `1 USD = ₱${soaData.exchangeRate.toFixed(2)} PHP`],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td className="py-0.5 pr-4 text-slate-500 font-medium w-32" style={{border:"none"}}>{label}</td>
                    <td className="py-0.5 font-mono font-semibold text-slate-900 text-right" style={{border:"none"}}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charges table */}
        <div className="mt-7 border border-slate-300 print-avoid-break">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="soa-main-header" style={{backgroundColor:"#1e293b"}}>
              <tr>
                <th className="w-12 py-2.5 px-4 text-center text-white text-xs uppercase tracking-widest font-bold" style={{border:"1px solid #334155"}}>No.</th>
                <th className="py-2.5 px-4 text-white text-xs uppercase tracking-widest font-bold" style={{border:"1px solid #334155"}}>Charge Type</th>
                <th className="py-2.5 px-4 text-right text-white text-xs uppercase tracking-widest font-bold" style={{border:"1px solid #334155"}}>Amount (USD)</th>
              </tr>
            </thead>
            <tbody>
              {chargeLines.map((line, idx) => (
                <tr key={line.label} className={`border-b border-slate-200 ${idx % 2 === 1 ? "bg-slate-50" : "bg-white"}`}>
                  <td className="py-2.5 px-4 text-center font-mono text-xs text-slate-400 font-semibold" style={{border:"1px solid #e2e8f0"}}>{idx + 1}</td>
                  <td className="py-2.5 px-4 text-slate-900" style={{border:"1px solid #e2e8f0"}}>{line.label}</td>
                  <td className={`py-2.5 px-4 text-right font-mono text-sm ${line.amount === 0 ? "text-slate-400" : "font-bold text-slate-900"}`} style={{border:"1px solid #e2e8f0"}}>{usd(line.amount)}</td>
                </tr>
              ))}
              <tr className="soa-grand-total" style={{backgroundColor:"#e2e8f0", borderTop:"2px solid #1e293b"}}>
                <td colSpan={2} className="py-3 px-4 text-right font-extrabold text-slate-900 uppercase tracking-wider text-sm" style={{border:"1px solid #94a3b8"}}>Grand Total</td>
                <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900 text-base" style={{border:"1px solid #94a3b8"}}>{usd(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payment + Signatories */}
        <div className="mt-7 grid grid-cols-2 gap-5 text-xs print-avoid-break">
          <div className="border border-slate-300 p-4">
            <p className="font-bold uppercase tracking-widest text-slate-400 text-[9px] mb-2">Payment / Remittance Instructions</p>
            <p className="text-slate-600">Please make check or wire transfers payable to:</p>
            <p className="font-bold text-slate-900 mt-1">DYNA-SERV GLOBAL CORPORATION</p>
            <p className="text-slate-600 mt-2">Bank: <span className="font-bold text-slate-900">Bank of the Philippine Islands (BPI)</span></p>
            <p className="font-mono text-slate-600 mt-0.5">
              USD Account: <span className="font-bold">9812-4091-22</span> &nbsp;&bull;&nbsp; SWIFT: <span className="font-bold">BOPIPHMM</span>
            </p>
          </div>
          <div className="border border-slate-300 p-4">
            <p className="font-bold uppercase tracking-widest text-slate-400 text-[9px] mb-3">Acknowledgement and Signatories</p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-slate-400 mb-6">Prepared By:</p>
                <div className="border-b border-slate-900 pb-0.5 font-bold text-slate-900 text-xs">MARIA LOURDES REYES</div>
                <p className="text-slate-400 text-[9px] mt-0.5">Billing and Finance Specialist</p>
              </div>
              <div>
                <p className="text-slate-400 mb-6">Approved By:</p>
                <div className="border-b border-slate-900 pb-0.5 font-bold text-slate-900 text-xs">JOSEPHINE TAN</div>
                <p className="text-slate-400 text-[9px] mt-0.5">Warehouse Operations Manager</p>
              </div>
            </div>
          </div>
        </div>

        {/* Conforme */}
        <div className="mt-5 border border-slate-300 p-4 print-avoid-break text-xs">
          <p className="font-bold uppercase tracking-widest text-slate-400 text-[9px] mb-4">Received and Accepted By (Conforme)</p>
          <div className="grid grid-cols-3 gap-8 text-center">
            {["Authorized Signature", "Printed Name and Title", "Date Received"].map((label) => (
              <div key={label}>
                <div className="border-b border-slate-800 h-8 mb-1" />
                <p className="text-slate-400 text-[9px]">{label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>{/* end printable doc */}

      {/* ── Appendix toggle (screen-only) ────────────────────────────────── */}
      <div className="no-print mt-6">
        <button
          onClick={() => setShowAppendix((v) => !v)}
          className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <FileText size={14} />
          {showAppendix ? "Hide Detailed Appendix" : "View Detailed Appendix"}
          {showAppendix ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <p className="mt-1 text-xs text-slate-400">
          Daily storage schedules, delivery routing logs, and hourly manpower breakdowns
        </p>
      </div>

      {/* ── Appendix body (hidden on screen until toggled; always prints) ── */}
      <div className={`${showAppendix ? "" : "hidden"} print:block print-page-break`}>

        <AppendixSection id="section-2" title="Appendix A — Delivery and Distribution Detail Schedule">
          <AppendixTable headers={["Date", "DR Number", "Consignee / Destination", "Delivery ($)", "Doc Fee ($)", "Remarks"]}>
            <tbody>
              {DEMO_DELIVERY_ROWS.map((d, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="py-1.5 px-3 whitespace-nowrap">{d.date}</td>
                  <td className="py-1.5 px-3 font-bold whitespace-nowrap">{d.dr}</td>
                  <td className="py-1.5 px-3">{d.consignee}</td>
                  <td className="py-1.5 px-3 text-right">{usd(d.delCharge)}</td>
                  <td className="py-1.5 px-3 text-right">{usd(d.docCharge)}</td>
                  <td className="py-1.5 px-3 text-slate-500">{d.remarks}</td>
                </tr>
              ))}
              <tr className="soa-total-row bg-slate-100 border-t-2 border-slate-700">
                <td colSpan={3} className="py-2 px-3 text-right font-bold uppercase tracking-wide text-xs">Total Delivery and Documentation</td>
                <td className="py-2 px-3 text-right font-bold">{usd(DEMO_DELIVERY_ROWS.reduce((s, r) => s + r.delCharge, 0))}</td>
                <td className="py-2 px-3 text-right font-bold">{usd(DEMO_DELIVERY_ROWS.reduce((s, r) => s + r.docCharge, 0))}</td>
                <td className="py-2 px-3" />
              </tr>
            </tbody>
          </AppendixTable>
        </AppendixSection>

        <AppendixSection id="section-3" title="Appendix B — LOA Permit Detail Schedule">
          <AppendixTable headers={["Permit No.", "Scope", "Valid From", "Valid To", "Monthly Rate ($)"]}>
            <tbody>
              {DEMO_LOA_ROWS.map((l, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="py-1.5 px-3 font-bold">{l.permit}</td>
                  <td className="py-1.5 px-3">{l.scope}</td>
                  <td className="py-1.5 px-3">{l.validFrom}</td>
                  <td className="py-1.5 px-3">{l.validTo}</td>
                  <td className="py-1.5 px-3 text-right font-bold">{usd(l.rate)}</td>
                </tr>
              ))}
              <tr className="soa-total-row bg-slate-100 border-t-2 border-slate-700">
                <td colSpan={4} className="py-2 px-3 text-right font-bold uppercase tracking-wide text-xs">Total LOA Permits</td>
                <td className="py-2 px-3 text-right font-bold">{usd(DEMO_LOA_ROWS.reduce((s, r) => s + r.rate, 0))}</td>
              </tr>
            </tbody>
          </AppendixTable>
        </AppendixSection>

        <AppendixSection id="section-4" title="Appendix C — Surety Bond and Other Contractual Fees">
          <AppendixTable headers={["Charge Description", "Code", "Amount ($)", "Notes"]}>
            <tbody>
              {DEMO_OTHER_CHARGES.map((o, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="py-1.5 px-3 font-semibold">{o.name}</td>
                  <td className="py-1.5 px-3">{o.code}</td>
                  <td className="py-1.5 px-3 text-right font-bold">{usd(o.amount)}</td>
                  <td className="py-1.5 px-3 text-slate-500">{o.notes}</td>
                </tr>
              ))}
            </tbody>
          </AppendixTable>
        </AppendixSection>

        <AppendixSection id="section-5" title="Appendix D — Manpower Activity Schedule">
          <AppendixTable headers={["Role / Activity", "Hours", "Rate ($/hr)", "Amount ($)", "Task Log"]}>
            <tbody>
              {DEMO_MANPOWER_ROWS.map((m, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="py-1.5 px-3 font-semibold">{m.role}</td>
                  <td className="py-1.5 px-3 text-right">{m.hours.toFixed(2)}</td>
                  <td className="py-1.5 px-3 text-right">{usd(m.rate)}</td>
                  <td className="py-1.5 px-3 text-right font-bold">{usd(m.amount)}</td>
                  <td className="py-1.5 px-3 text-slate-500">{m.notes}</td>
                </tr>
              ))}
              <tr className="soa-total-row bg-slate-100 border-t-2 border-slate-700">
                <td colSpan={3} className="py-2 px-3 text-right font-bold uppercase tracking-wide text-xs">Total Manpower</td>
                <td className="py-2 px-3 text-right font-bold">{usd(DEMO_MANPOWER_ROWS.reduce((s, r) => s + r.amount, 0))}</td>
                <td className="py-2 px-3" />
              </tr>
            </tbody>
          </AppendixTable>
        </AppendixSection>

        <AppendixSection id="section-7" title="Appendix E — Daily Warehousing CBM Storage Calculation (30-Day Replay)">
          <AppendixTable headers={["Date", "Beg CBM", "+ In FG", "+ In Raw", "Out FG", "Out Raw", "End CBM", "Rate ($/CBM/day)", "Charge ($)"]}>
            <tbody>
              {DEMO_CBM_ROWS.map((r, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="py-1 px-2 font-semibold whitespace-nowrap">{r.date}</td>
                  <td className="py-1 px-2 text-right">{usd(r.beg)}</td>
                  <td className="py-1 px-2 text-right">{r.inFg > 0 ? `+${usd(r.inFg)}` : "—"}</td>
                  <td className="py-1 px-2 text-right">{r.inRaw > 0 ? `+${usd(r.inRaw)}` : "—"}</td>
                  <td className="py-1 px-2 text-right">{r.outFg > 0 ? `−${usd(r.outFg)}` : "—"}</td>
                  <td className="py-1 px-2 text-right">{r.outRaw > 0 ? `−${usd(r.outRaw)}` : "—"}</td>
                  <td className="py-1 px-2 text-right font-bold">{usd(r.end)}</td>
                  <td className="py-1 px-2 text-right">${r.rate.toFixed(4)}</td>
                  <td className="py-1 px-2 text-right font-bold">{usd(r.amount)}</td>
                </tr>
              ))}
              <tr className="soa-total-row bg-slate-100 border-t-2 border-slate-700">
                <td colSpan={8} className="py-2 px-2 text-right font-bold uppercase tracking-wide text-xs">Total Warehousing Storage (30 Days)</td>
                <td className="py-2 px-2 text-right font-bold">{usd(DEMO_CBM_ROWS.reduce((s, r) => s + r.amount, 0))}</td>
              </tr>
            </tbody>
          </AppendixTable>
        </AppendixSection>

      </div>
    </div>
  );
}
