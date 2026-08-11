import Link from "next/link";
import { CheckCircle2, ClipboardList, MapPin, ArrowLeftRight, ArrowDown, Circle, XCircle, MinusCircle, ChevronRight } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: "OPEN",
  passed: "PASSED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-tertiary-container text-on-tertiary-container",
  passed: "bg-primary-container text-on-primary-container",
  failed: "bg-error-container text-error",
  cancelled: "bg-surface-container-highest text-on-surface",
};


// ─── Mock data (TODO: wire to real inspection_cases query) ────────────────────

interface InspectionCaseRow {
  id: string;
  contextType: "inbound" | "transfer";
  lotNumber: string;
  itemName: string;
  locationCode: string;
  status: "open" | "passed" | "failed" | "cancelled";
  openedAt: string;
  // Office-only fields
  openedBy?: string;
  sourceRef?: string;
}

const MOCK_INSPECTIONS: InspectionCaseRow[] = [
  {
    id: "mock-ic-001",
    contextType: "transfer",
    lotNumber: "LOT-2026-0042",
    itemName: "Hydraulic Coupling Assembly",
    locationCode: "LOC-A03",
    status: "open",
    openedAt: new Date().toISOString(),
    openedBy: "sys-auto",
    sourceRef: "TRF-2026-001",
  },
  {
    id: "mock-ic-002",
    contextType: "inbound",
    lotNumber: "LOT-2026-0031",
    itemName: "Pressure Sensor Unit",
    locationCode: "INSPECT-01",
    status: "open",
    openedAt: new Date().toISOString(),
    openedBy: "sys-auto",
    sourceRef: "WRR-2026-008",
  },
  {
    id: "mock-ic-003",
    contextType: "transfer",
    lotNumber: "LOT-2026-0019",
    itemName: "Valve Seal Kit (VMI)",
    locationCode: "LOC-B07",
    status: "passed",
    openedAt: new Date(Date.now() - 3_600_000).toISOString(),
    openedBy: "warehouse-user-1",
    sourceRef: "TRF-2026-009",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ status?: string; tab?: string }>;
}

export default async function InspectionQueuePage({ searchParams }: PageProps) {
  const { status: statusFilter } = await searchParams;
  const resolver = await createPageResolver();

  // Gate: inspection.perform required to access inspection queue.
  const permResult = await requirePermission(resolver, "inspection.perform");
  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <p className="font-body text-body-md text-on-surface-variant">
          You do not have permission to view the inspection queue.
        </p>
        <p className="mt-xs font-body text-body-sm text-on-surface-variant">
          This page requires the{" "}
          <span className="font-mono text-body-md font-semibold">inspection.perform</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  // Surface detection
  const isFloor = permResult.context.activeRoleKeys.includes("warehouse_staff");

  const openCases = MOCK_INSPECTIONS.filter((c) => c.status === "open");

  // ── Floor surface ────────────────────────────────────────────────────────────
  if (isFloor) {
    return (
      <div className="mx-auto w-full max-w-md animate-in fade-in duration-300 pb-[100px]">
        {/* Floor top bar */}
        <div className="mb-md rounded-xl bg-surface-container-lowest p-md shadow-sm border border-outline-variant">
          <h1 className="font-heading text-display-sm font-bold text-on-surface tracking-tight">
            Daily Inspection
          </h1>
          <p className="mt-xs font-body text-body-md text-on-surface-variant">
            Inspections assigned to you today
          </p>
        </div>

        {openCases.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-xl text-center shadow-sm">
            <CheckCircle2
              size={48}
              strokeWidth={1.5}
              className="text-primary mx-auto mb-sm"
              aria-hidden="true"
            />
            <p className="font-heading text-title-lg font-semibold text-on-surface">
              No inspections assigned today
            </p>
            <p className="mt-xs font-body text-body-md text-on-surface-variant">
              Check back later or contact your supervisor.
            </p>
          </div>
        ) : (
          <div className="space-y-sm">
            {openCases.map((inspection) => (
              <Link
                key={inspection.id}
                href={`/inspection/${inspection.id}`}
                className="block rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 relative overflow-hidden group"
              >
                <div className="flex items-start gap-md">
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-title-md font-semibold text-on-surface">
                      {inspection.itemName}
                    </p>

                    <p className="mt-xs font-mono text-body-md text-on-surface-variant">
                      {inspection.lotNumber}
                    </p>

                    <div className="mt-sm flex items-center gap-xs">
                      <MapPin size={20} strokeWidth={2} aria-hidden="true" className="text-primary shrink-0" />
                      <span className="font-body text-body-md text-on-surface-variant">
                        {inspection.locationCode}
                      </span>
                    </div>

                    <div className="mt-sm flex items-center gap-xs">
                      <span
                        className={`inline-flex items-center gap-xs rounded-full px-3 py-1 font-label text-label-sm uppercase ${
                          inspection.contextType === "transfer"
                            ? "bg-primary-container text-on-primary-container"
                            : "bg-surface-container-highest text-on-surface"
                        }`}
                      >
                        {inspection.contextType === "transfer"
                          ? <ArrowLeftRight size={16} strokeWidth={2} aria-hidden="true" />
                          : <ArrowDown size={16} strokeWidth={2} aria-hidden="true" />}
                        {inspection.contextType === "transfer"
                          ? "Transfer"
                          : "Inbound"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-highest group-hover:bg-primary/10 transition-colors self-center">
                    <ChevronRight size={20} strokeWidth={2} aria-hidden="true" className="text-on-surface-variant group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Office surface ───────────────────────────────────────────────────────────

  const filtered =
    statusFilter && statusFilter !== ""
      ? MOCK_INSPECTIONS.filter((c) => c.status === statusFilter)
      : MOCK_INSPECTIONS;

  const STATUS_FILTER_OPTIONS = [
    { value: "", label: "All" },
    { value: "open", label: "Open" },
    { value: "passed", label: "Passed" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="mx-auto w-full animate-in fade-in duration-300">
      {/* Page header */}
      <div className="mb-lg">
        <h1 className="font-heading text-display-md font-bold text-on-surface tracking-tight">
          Inspection Queue
        </h1>
        <p className="mt-xs font-body text-body-lg text-on-surface-variant">
          All inspection cases — inbound and transfer contexts.
        </p>
      </div>

      {/* Status filter */}
      <div className="mb-md rounded-xl bg-surface-container-lowest p-md shadow-sm border border-outline-variant flex flex-wrap items-end gap-sm">
        <form method="GET" className="flex flex-wrap items-end gap-sm w-full sm:w-auto">
          <div className="flex flex-col gap-xs flex-1 sm:flex-initial">
            <label
              htmlFor="status-filter"
              className="font-label text-label-sm text-on-surface-variant"
            >
              Status
            </label>
            <select
              id="status-filter"
              name="status"
              defaultValue={statusFilter ?? ""}
              className="h-11 w-full sm:w-auto min-w-[200px] rounded-md border border-outline-variant bg-surface-container-highest px-3 font-body text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded-md bg-primary px-lg font-label text-label-md text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Apply
          </button>
          {statusFilter && (
            <Link
              href="/inspection"
              className="flex h-11 items-center justify-center rounded-md border border-outline-variant px-lg font-label text-label-md text-on-surface hover:bg-surface-container-highest transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Office table */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <ClipboardList
              size={48}
              className="mx-auto text-on-surface-variant/50 mb-sm"
              aria-hidden="true"
            />
            <p className="font-body text-body-lg text-on-surface-variant">
              {statusFilter
                ? "No inspection cases match the current filter."
                : "No inspection cases yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/50 bg-surface-container-highest">
                  <th className="px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Lot Number
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Item
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Context
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Opened At
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-container-highest/50 transition-colors group">
                    <td className="px-4 py-3 font-mono text-body-md text-on-surface">
                      {row.lotNumber}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface font-medium">
                      {row.itemName}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface capitalize">
                      {row.contextType}
                    </td>
                    <td className="px-4 py-3 font-mono text-body-md text-on-surface">
                      {row.locationCode}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-xs rounded-full px-2 py-0.5 font-label text-label-sm uppercase ${STATUS_CLASSES[row.status] ?? "bg-surface-container-highest text-on-surface"}`}
                      >
                        {row.status === "open" ? <Circle size={14} className="text-tertiary" aria-hidden="true" /> :
                         row.status === "passed" ? <CheckCircle2 size={14} className="text-primary" aria-hidden="true" /> :
                         row.status === "failed" ? <XCircle size={14} className="text-error" aria-hidden="true" /> :
                         <MinusCircle size={14} className="text-on-surface-variant" aria-hidden="true" />}
                        {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface-variant">
                      {new Date(row.openedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/inspection/${row.id}`}
                        className="inline-flex h-8 items-center justify-center rounded-full bg-primary/10 px-3 font-label text-label-sm text-primary hover:bg-primary/20 transition-colors focus:outline-none focus:ring-2 focus:ring-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        {row.status === "open" ? "Inspect" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
