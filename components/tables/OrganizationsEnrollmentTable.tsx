"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Plus } from "lucide-react";
import { DataTable } from "./DataTable";
import type { PartyListRow } from "@/lib/db/queries/parties";

export function OrganizationsEnrollmentTable({
  data,
  canManage = false,
}: {
  data: PartyListRow[];
  canManage?: boolean;
}) {
  const columns = useMemo<ColumnDef<PartyListRow, unknown>[]>(() => [
    // 1. Organization Code
    {
      accessorKey: "code",
      header: "Code",
      meta: {
        filterVariant: "text",
        filterLabel: "Org Code",
      },
      cell: (info) => (
        <span className="font-mono font-bold text-brand-navy">{String(info.getValue())}</span>
      ),
    },

    // 2. Organization / Party Name
    {
      accessorKey: "name",
      header: "Organization Name",
      meta: {
        filterVariant: "text",
        filterLabel: "Organization Name",
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <div>
            <span className="font-heading font-semibold text-slate-900">{String(info.getValue())}</span>
            {row.contactPerson && (
              <span className="block text-[11px] text-text-grey">
                Contact: {row.contactPerson} {row.email ? `(${row.email})` : ""}
              </span>
            )}
          </div>
        );
      },
    },

    // 3. Email
    {
      accessorKey: "email",
      header: "Email",
      meta: {
        filterVariant: "text",
        filterLabel: "Email",
      },
      cell: (info) => <span className="font-mono text-xs text-text-grey">{String(info.getValue() || "—")}</span>,
    },

    // 4. Active Status (Status pill)
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

    // 5. Created Date
    {
      accessorKey: "createdAt",
      header: "Enrolled Date",
      meta: {
        filterVariant: "date-range",
        filterLabel: "Enrollment Date",
      },
      cell: (info) => (
        <span className="font-mono text-xs text-text-grey">
          {new Date(info.getValue() as string | Date).toLocaleDateString()}
        </span>
      ),
    },

    // 6. Action
    {
      id: "actions",
      header: "Action",
      meta: {
        align: "right",
      },
      cell: (info) => {
        const party = info.row.original;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/master-data/parties/${party.id}`}
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
      title="Organizations Directory"
      subtitle="Master directory of customers, vendors, carriers, and VMI consignors"
      icon={<Building2 size={18} />}
      actions={
        canManage ? (
          <Link
            href="/master-data/parties/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-surface-white hover:bg-primary/90 transition-all shadow-sm"
          >
            <Plus size={14} /> New Organization
          </Link>
        ) : null
      }
      emptyMessage="No organizations found matching the specified filters."
    />
  );
}
