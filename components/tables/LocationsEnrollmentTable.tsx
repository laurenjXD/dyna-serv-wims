"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPin, Plus, Layers } from "lucide-react";
import { DataTable } from "./DataTable";
import type { LocationListRow } from "@/lib/db/queries/locations";

export function LocationsEnrollmentTable({
  data,
  canManage = false,
}: {
  data: LocationListRow[];
  canManage?: boolean;
}) {
  const columns = useMemo<ColumnDef<LocationListRow, unknown>[]>(() => [
    // 1. Location Label (e.g. A-01-01-01)
    {
      accessorKey: "label",
      header: "Location Label",
      meta: {
        filterVariant: "text",
        filterLabel: "Location Label",
      },
      cell: (info) => (
        <span className="font-mono font-bold text-brand-navy">{String(info.getValue())}</span>
      ),
    },

    // 2. Zone (Categorical Multi-Select)
    {
      accessorKey: "zone",
      header: "Zone",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Zone",
      },
      cell: (info) => (
        <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-200 uppercase">
          Zone {String(info.getValue())}
        </span>
      ),
    },

    // 3. Aisle / Rack
    {
      accessorKey: "rack",
      header: "Aisle / Rack",
      meta: {
        filterVariant: "text",
        filterLabel: "Rack",
      },
      cell: (info) => <span className="font-mono text-xs text-slate-800">{String(info.getValue())}</span>,
    },

    // 4. Level & Position
    {
      id: "coordinates",
      header: "Level / Pos",
      accessorFn: (row) => `L${row.level} / P${row.position}`,
      meta: {
        filterVariant: "text",
        filterLabel: "Coordinates",
      },
      cell: (info) => <span className="font-mono text-xs text-text-grey">{String(info.getValue())}</span>,
    },

    // 5. Type (Floor, Rack, Staging, Quarantine)
    {
      accessorKey: "locationType",
      header: "Type",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Location Type",
        filterOptions: [
          { label: "Standard Rack", value: "standard_rack" },
          { label: "Floor Storage", value: "floor_storage" },
          { label: "Staging Bay", value: "staging_bay" },
          { label: "Quarantine", value: "quarantine" },
        ],
      },
      cell: (info) => (
        <span className="text-[11px] font-medium text-slate-700 capitalize">
          {String(info.getValue()).replace("_", " ")}
        </span>
      ),
    },

    // 6. Max CBM Capacity (Numeric Range)
    {
      accessorKey: "maxCbmCapacity",
      header: "Max CBM",
      meta: {
        filterVariant: "numeric-range",
        filterLabel: "Max CBM",
        align: "right",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-slate-900 font-semibold">
          {Number(info.getValue())?.toLocaleString(undefined, { maximumFractionDigits: 2 })} m³
        </span>
      ),
    },

    // 7. Status
    {
      accessorKey: "isActive",
      header: "Status",
      meta: {
        filterVariant: "boolean",
        filterLabel: "Active Status",
      },
      cell: (info) => {
        const active = Boolean(info.getValue());
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
              active
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
            {active ? "Active" : "Inactive"}
          </span>
        );
      },
    },

    // 8. Actions
    {
      id: "actions",
      header: "Action",
      meta: {
        align: "right",
      },
      cell: (info) => {
        const loc = info.row.original;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/master-data/locations/${loc.id}`}
              className="rounded bg-slate-100 hover:bg-brand-navy hover:text-white px-2.5 py-1 text-[11px] font-bold text-slate-800 transition-colors shadow-sm"
            >
              View
            </Link>
          </div>
        );
      },
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={data}
      title="Warehouse Location Grid"
      subtitle="Master directory of warehouse zones, aisles, rack bays, levels, and CBM volumetric limits"
      icon={<MapPin size={18} />}
      enableGrouping={true}
      initialGrouping={["zone"]}
      actions={
        canManage ? (
          <>
            <Link
              href="/master-data/locations/bulk"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-surface-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Layers size={14} /> Bulk Generate
            </Link>
            <Link
              href="/master-data/locations/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-surface-white hover:bg-primary/90 transition-all shadow-sm"
            >
              <Plus size={14} /> New Location
            </Link>
          </>
        ) : null
      }
      emptyMessage="No locations found matching the specified filters."
    />
  );
}
