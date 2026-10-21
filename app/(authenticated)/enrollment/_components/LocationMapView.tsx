"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ExternalLink, MapPinned, Search } from "lucide-react";
import type { LocationMapRow } from "@/lib/db/queries/locations";
import {
  WAREHOUSE_MAP_CELLS,
  WAREHOUSE_MAP_LAYOUT_VERSION,
  WAREHOUSE_MAP_SOURCE,
  WAREHOUSE_MAP_VIEWBOX,
  WAREHOUSE_RACK_LAYOUT,
  rackLabelsForMap,
} from "@/lib/location-map/layout";
import type { LocationMapStatus } from "@/lib/location-map/status";

const STATUS_META: Record<LocationMapStatus, { label: string; color: string; className: string }> = {
  available: { label: "Available", color: "#10B981", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  occupied: { label: "Occupied", color: "#2563EB", className: "bg-blue-50 text-blue-800 border-blue-200" },
  near_capacity: { label: "Near capacity", color: "#F59E0B", className: "bg-amber-50 text-amber-900 border-amber-200" },
  full: { label: "Full", color: "#EF4444", className: "bg-red-50 text-red-800 border-red-200" },
  unavailable: { label: "Unavailable", color: "#94A3B8", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

const LOCATION_TYPE_LABELS: Record<string, string> = {
  receiving_bay: "Receiving bay",
  inspection: "Inspection",
  storage: "Storage",
  picking: "Picking",
  dispatch: "Dispatch",
};

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

function statusForCell(row: LocationMapRow | undefined): { color: string; label: string } {
  if (!row) return { color: "#F8FAFC", label: "No enrolled location" };
  return { color: STATUS_META[row.status].color, label: STATUS_META[row.status].label };
}

export function LocationMapView({
  rows,
  initialSelectedLabel,
  initialSearch,
}: {
  rows: LocationMapRow[];
  initialSelectedLabel?: string;
  initialSearch?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rackFilter, setRackFilter] = useState("all");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [selectedLabel, setSelectedLabel] = useState(initialSelectedLabel ?? "");

  const rowByLabel = useMemo(() => new Map(rows.map((row) => [row.label, row])), [rows]);
  const normalizedSearch = search.trim().toLowerCase();
  const organizationOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => row.organizationNames))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filteredRows = useMemo(() => rows.filter((row) => {
    const searchable = [
      row.label,
      row.zone,
      row.rack,
      row.level,
      row.position,
      row.locationType,
      ...row.itemCodes,
      ...row.lotNumbers,
      ...row.organizationNames,
    ].join(" ").toLowerCase();

    return (
      (!normalizedSearch || searchable.includes(normalizedSearch)) &&
      (statusFilter === "all" || row.status === statusFilter) &&
      (rackFilter === "all" || row.rack === rackFilter) &&
      (organizationFilter === "all" || row.organizationNames.includes(organizationFilter))
    );
  }), [normalizedSearch, organizationFilter, rackFilter, rows, statusFilter]);

  const filteredByLabel = useMemo(
    () => new Map(filteredRows.map((row) => [row.label, row])),
    [filteredRows],
  );

  const selectedRow = selectedLabel ? rowByLabel.get(selectedLabel) : undefined;
  const mappedRows = filteredRows.filter((row) => row.isMapped);
  const unmappedRows = filteredRows.filter((row) => !row.isMapped);
  const rackLabels = rackLabelsForMap();
  const visibleCells = rackFilter === "all"
    ? WAREHOUSE_MAP_CELLS
    : WAREHOUSE_MAP_CELLS.filter((cell) => cell.rack === rackFilter);

  function selectLocation(row: LocationMapRow | undefined, label: string) {
    setSelectedLabel(label);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "locations");
    params.set("view", "map");
    params.set("label", label);
    router.replace(`/enrollment?${params.toString()}`, { scroll: false });
    if (!row) return;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl bg-surface-white p-4 shadow-elevation-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned size={20} className="text-primary" aria-hidden="true" />
            <h2 className="font-heading text-headline-md font-semibold text-on-surface">Warehouse map</h2>
          </div>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Live location occupancy mapped to the Excel Racking ID arrangement. The workbook is a geometry reference, not a source of capacity or stock status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 font-label text-label">
          <label className="relative min-w-[220px] flex-1 lg:flex-none">
            <span className="sr-only">Search map</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-3 text-text-grey" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search label, item, lot, organization"
              className="h-11 w-full rounded-xl border border-outline-variant bg-surface-white pl-9 pr-3 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-outline-variant bg-surface-white px-3 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Focus rack</span>
            <select
              value={rackFilter}
              onChange={(event) => setRackFilter(event.target.value)}
              className="h-11 rounded-xl border border-outline-variant bg-surface-white px-3 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All racks</option>
              {rackLabels.map((rack) => <option key={rack} value={rack}>Rack {rack}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by organization</span>
            <select
              value={organizationFilter}
              onChange={(event) => setOrganizationFilter(event.target.value)}
              className="h-11 max-w-[240px] rounded-xl border border-outline-variant bg-surface-white px-3 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All organizations</option>
              {organizationOptions.map((organization) => (
                <option key={organization} value={organization}>{organization}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Map status legend">
        {Object.entries(STATUS_META).map(([value, meta]) => (
          <span key={value} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-label text-label ${meta.className}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
            {meta.label}
          </span>
        ))}
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-label text-label text-slate-600">
          {mappedRows.length} mapped rack locations{unmappedRows.length > 0 ? ` · ${unmappedRows.length} unmapped matches` : ""}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-2xl bg-surface-white p-3 shadow-elevation-1 sm:p-5" aria-label="Interactive warehouse rack map">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">Layout {WAREHOUSE_MAP_LAYOUT_VERSION}</p>
              <p className="font-body text-body-sm text-text-grey">Select a cell to inspect its live capacity and stock summary.</p>
            </div>
            <span className="hidden font-mono text-xs text-text-grey sm:inline">{WAREHOUSE_MAP_SOURCE}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-outline-variant/70 bg-slate-50 p-2">
            <svg
              viewBox={`0 0 ${WAREHOUSE_MAP_VIEWBOX.width} ${WAREHOUSE_MAP_VIEWBOX.height}`}
              role="img"
              aria-label="Warehouse rack layout for racks A through I"
              className={`h-auto min-w-[620px] ${rackFilter === "all" ? "w-full" : "w-full max-w-[760px]"}`}
            >
              <text x="24" y="34" className="fill-slate-700 text-[22px] font-bold">DSGC WAREHOUSE</text>
              <text x="24" y="58" className="fill-slate-500 text-[13px]">Rack positions · live WIMS status</text>
              {visibleCells.map((cell) => {
                const row = filteredByLabel.get(cell.label) ?? rowByLabel.get(cell.label);
                const { color, label } = statusForCell(row);
                const selected = selectedLabel === cell.label;
                const isFilteredOut = Boolean(row && !filteredByLabel.has(cell.label));
                return (
                  <g
                    key={cell.key}
                    role="button"
                    tabIndex={0}
                    aria-label={`${cell.label}: ${isFilteredOut ? "filtered out" : label}`}
                    onClick={() => selectLocation(row, cell.label)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectLocation(row, cell.label);
                      }
                    }}
                    className="cursor-pointer outline-none"
                    opacity={isFilteredOut ? 0.18 : 1}
                  >
                    <rect
                      x={cell.x}
                      y={cell.y}
                      width={cell.width - 0.8}
                      height={cell.height - 0.8}
                      rx="1.5"
                      fill={color}
                      stroke={selected ? "#0F172A" : "#CBD5E1"}
                      strokeWidth={selected ? 3 : 0.8}
                    />
                    {cell.height >= 28 && (
                      <text x={cell.x + cell.width / 2} y={cell.y + cell.height / 2 + 3} textAnchor="middle" className="pointer-events-none fill-slate-700 text-[8px] font-semibold">
                        {cell.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {WAREHOUSE_RACK_LAYOUT
                .filter((layout) => rackFilter === "all" || layout.rack === rackFilter)
                .map((layout) => {
                  const levelHeight = layout.height / layout.levels;
                  return (
                    <g key={`${layout.rack}-labels`} className="pointer-events-none">
                      <text
                        x={layout.x}
                        y={layout.y - 12}
                        className="fill-slate-700 text-[18px] font-bold"
                      >
                        RACK {layout.rack}
                      </text>
                      <text
                        x={layout.x - 7}
                        y={layout.y - 2}
                        textAnchor="end"
                        className="fill-slate-500 text-[7px] font-bold"
                      >
                        LVL
                      </text>
                      {Array.from({ length: layout.levels }, (_, levelIndex) => (
                        <text
                          key={`${layout.rack}-level-${layout.levels - levelIndex}`}
                          x={layout.x - 7}
                          y={layout.y + levelIndex * levelHeight + levelHeight / 2 + 2.5}
                          textAnchor="end"
                          className="fill-slate-500 text-[8px] font-mono font-semibold"
                        >
                          {layout.levels - levelIndex}
                        </text>
                      ))}
                    </g>
                  );
                })}
            </svg>
          </div>
        </section>

        <aside className="rounded-2xl bg-surface-white p-5 shadow-elevation-1" aria-live="polite">
          {selectedRow ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">Selected location</p>
                  <h3 className="mt-1 font-mono text-data-display font-semibold text-brand-navy">{selectedRow.label}</h3>
                </div>
                <span className={`rounded-full border px-2.5 py-1 font-label text-label ${STATUS_META[selectedRow.status].className}`}>
                  {STATUS_META[selectedRow.status].label}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 font-body text-body-sm">
                <div><dt className="text-text-grey">Rack / level / position</dt><dd className="mt-1 font-semibold text-on-surface">{selectedRow.rack} / {selectedRow.level} / {selectedRow.position}</dd></div>
                <div><dt className="text-text-grey">Location type</dt><dd className="mt-1 font-semibold text-on-surface">{LOCATION_TYPE_LABELS[selectedRow.locationType] ?? selectedRow.locationType}</dd></div>
                <div><dt className="text-text-grey">Occupied CBM</dt><dd className="mt-1 font-semibold text-on-surface">{formatNumber(selectedRow.occupiedCbm, 4)} m³</dd></div>
                <div><dt className="text-text-grey">Utilization</dt><dd className="mt-1 font-semibold text-on-surface">{selectedRow.utilizationPct === null ? "Capacity missing" : `${formatNumber(selectedRow.utilizationPct, 1)}%`}</dd></div>
                <div><dt className="text-text-grey">Items / lots</dt><dd className="mt-1 font-semibold text-on-surface">{selectedRow.itemCount} / {selectedRow.lotCount}</dd></div>
                <div><dt className="text-text-grey">Units</dt><dd className="mt-1 font-semibold text-on-surface">{formatNumber(selectedRow.totalUnits, 0)}</dd></div>
              </dl>
              <div className="mt-5 space-y-3 border-t border-outline-variant/70 pt-4 font-body text-body-sm">
                <div><p className="text-text-grey">Item codes</p><p className="mt-1 font-semibold text-on-surface">{selectedRow.itemCodes.length ? selectedRow.itemCodes.join(", ") : "No stock"}</p></div>
                <div><p className="text-text-grey">Lots</p><p className="mt-1 font-semibold text-on-surface">{selectedRow.lotNumbers.length ? selectedRow.lotNumbers.join(", ") : "No stock"}</p></div>
                {selectedRow.organizationNames.length > 0 && <div><p className="text-text-grey">Organizations</p><p className="mt-1 font-semibold text-on-surface">{selectedRow.organizationNames.join(", ")}</p></div>}
              </div>
              <Link href={`/master-data/locations/${selectedRow.id}`} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-label text-label text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30">
                Open location detail <ExternalLink size={15} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <MapPinned size={28} className="text-text-grey" aria-hidden="true" />
              <h3 className="mt-3 font-heading text-headline-md font-semibold text-on-surface">Select a map cell</h3>
              <p className="mt-1 max-w-[230px] font-body text-body-sm text-text-grey">Choose a rack position to see its current capacity and stock summary.</p>
            </div>
          )}
        </aside>
      </div>

      {unmappedRows.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label="Unmapped locations">
          <h3 className="font-heading text-data-display font-semibold text-amber-950">Locations not drawn on this reference layout</h3>
          <p className="mt-1 font-body text-body-sm text-amber-900">These records remain available and searchable in Table View. They are not placed on the SVG until their physical geometry is confirmed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unmappedRows.slice(0, 20).map((row) => (
              <button key={row.id} type="button" onClick={() => selectLocation(row, row.label)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-xs font-semibold text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
                {row.label}
              </button>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

