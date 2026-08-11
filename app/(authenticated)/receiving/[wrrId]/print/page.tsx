import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getWrrDocument } from "@/lib/db/queries/receiving";
import type { WrrItemRow } from "@/lib/db/queries/receiving";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

const DISPOSITION_LABELS: Record<string, string> = {
  store: "STORE",
  inspect: "INSPECT",
};

interface PageProps {
  params: Promise<{ wrrId: string }>;
}

export default async function WrrPrintPage({ params }: PageProps) {
  const { wrrId } = await params;
  const resolver = await createPageResolver();

  const permResult = await requirePermission(resolver, "receiving.view");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const wrr = await getWrrDocument(db, wrrId);
  if (!wrr) {
    notFound();
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              aside, header, nav[aria-label="Breadcrumb"], .print-hide {
                display: none !important;
              }
              body {
                background: #FFFFFF !important;
                color: #000000 !important;
              }
              main {
                padding: 0 !important;
                margin: 0 !important;
                background: none !important;
              }
              .print-document {
                box-shadow: none !important;
                border: none !important;
                padding: 0 !important;
                background: #FFFFFF !important;
                color: #000000 !important;
              }
              .print-table th {
                background: #F1F3F9 !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
              }
            }
          `,
        }}
      />

      <div className="mx-auto w-full max-w-4xl animate-in fade-in duration-300">
        {/* Breadcrumb — hidden on print */}
        <nav
          aria-label="Breadcrumb"
          className="mb-md print-hide"
        >
          <ol className="flex items-center gap-xs font-label text-label-md text-on-surface-variant uppercase tracking-wider">
            <li>
              <Link
                href="/receiving"
                className="inline-flex h-8 items-center rounded-sm hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              >
                Receiving Queue
              </Link>
            </li>
            <li aria-hidden="true" className="text-outline-variant">/</li>
            <li>
              <Link
                href={`/receiving/${wrrId}`}
                className="inline-flex h-8 items-center rounded-sm hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {wrr.wrrNumber}
              </Link>
            </li>
            <li aria-hidden="true" className="text-outline-variant">/</li>
            <li aria-current="page" className="font-label text-label-md text-on-surface">
              Print
            </li>
          </ol>
        </nav>

        {/* Screen-only print button */}
        <div className="mb-lg flex gap-sm print-hide">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
            suppressHydrationWarning
            className="flex h-11 items-center justify-center gap-sm rounded-full bg-primary px-lg font-label text-label-lg text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <span className="material-symbols-outlined text-[20px]">print</span>
            Print Document
          </button>
          <Link
            href={`/receiving/${wrrId}`}
            className="flex h-11 items-center justify-center rounded-full border border-outline-variant px-lg font-label text-label-lg text-on-surface hover:bg-surface-container-highest transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Back to WRR
          </Link>
        </div>

        {/* Printable WRR document */}
        <div className="print-document rounded-xl bg-white p-xl shadow-md border border-outline-variant/30 text-black">
          {/* Document header */}
          <div className="border-b-2 border-black pb-md">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-heading text-display-md font-bold text-black tracking-tight">
                  Dyna-Serv WIMS
                </h1>
                <p className="mt-xs font-label text-label-lg uppercase tracking-wider text-black/70">
                  Warehouse Receipt Record
                </p>
              </div>
              <div className="text-right">
                <p className="font-label text-label-md uppercase tracking-wider text-black/70">
                  WRR Number
                </p>
                <p className="font-mono text-display-sm font-bold text-black mt-xs">
                  {wrr.wrrNumber}
                </p>
                <p className="mt-xs font-body text-body-sm text-black/70">
                  Printed: {new Date().toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Header fields */}
          <div className="mt-lg grid gap-md sm:grid-cols-2 lg:grid-cols-4 bg-gray-50/50 rounded-lg p-md border border-gray-200">
            <div>
              <p className="font-label text-label-sm uppercase tracking-wider text-black/70">
                Flow Type
              </p>
              <p className="mt-xs font-body text-body-lg font-medium text-black">
                {FLOW_LABELS[wrr.flowType] ?? wrr.flowType}
              </p>
            </div>
            <div>
              <p className="font-label text-label-sm uppercase tracking-wider text-black/70">
                Vendor Party ID
              </p>
              <p className="mt-xs font-mono text-body-lg font-medium text-black">
                {wrr.vendorPartyId}
              </p>
            </div>
            <div>
              <p className="font-label text-label-sm uppercase tracking-wider text-black/70">
                Created At
              </p>
              <p className="mt-xs font-body text-body-lg font-medium text-black">
                {wrr.createdAt.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="font-label text-label-sm uppercase tracking-wider text-black/70">
                Staged By
              </p>
              <p className="mt-xs font-mono text-body-lg font-medium text-black">
                {wrr.stagedByUserId}
              </p>
            </div>
            <div>
              <p className="font-label text-label-sm uppercase tracking-wider text-black/70">
                Status
              </p>
              <p className="mt-xs font-label text-label-lg uppercase text-black">
                {wrr.status.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          {/* Line items table */}
          <div className="mt-xl">
            <h2 className="font-heading text-title-lg font-bold text-black border-b border-gray-200 pb-sm mb-md">
              Expected Lines
            </h2>
            {wrr.items.length === 0 ? (
              <p className="mt-md font-body text-body-lg text-black/70 italic">
                No line items.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="print-table w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-black">
                        Lot Number
                      </th>
                      <th className="border border-gray-300 px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-black">
                        Item ID
                      </th>
                      <th className="border border-gray-300 px-4 py-3 text-right font-label text-label-sm uppercase tracking-wider text-black">
                        Expected Qty
                      </th>
                      <th className="border border-gray-300 px-4 py-3 text-right font-label text-label-sm uppercase tracking-wider text-black">
                        Scanned Qty
                      </th>
                      <th className="border border-gray-300 px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-black">
                        Disposition
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {wrr.items.map((item: WrrItemRow) => (
                      <tr key={item.id} className="border-b border-gray-300">
                        <td className="border border-gray-300 px-4 py-3 font-mono text-body-md text-black">
                          {item.lotNumber}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 font-mono text-body-md text-black">
                          {item.itemId ?? "—"}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-right font-mono text-body-md text-black">
                          {item.expectedQty}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-right font-mono text-body-md text-black">
                          {item.scannedQty}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 font-label text-label-md uppercase text-black font-semibold">
                          {DISPOSITION_LABELS[item.disposition] ??
                            item.disposition.toUpperCase()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer — signature lines */}
          <div className="mt-24 grid gap-8 sm:grid-cols-3">
            <div>
              <div className="border-b border-black pb-1" />
              <p className="mt-2 font-label text-label-md uppercase tracking-wider text-black/70">
                Received By
              </p>
            </div>
            <div>
              <div className="border-b border-black pb-1" />
              <p className="mt-2 font-label text-label-md uppercase tracking-wider text-black/70">
                Checked By
              </p>
            </div>
            <div>
              <div className="border-b border-black pb-1" />
              <p className="mt-2 font-label text-label-md uppercase tracking-wider text-black/70">
                Supervisor
              </p>
            </div>
          </div>

          {/* Warehouse stamp area */}
          <div className="mt-12">
            <div className="h-32 w-64 rounded border-2 border-dashed border-gray-400 p-3 flex items-center justify-center">
              <p className="font-label text-label-lg uppercase tracking-wider text-gray-400">
                Warehouse Stamp
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
