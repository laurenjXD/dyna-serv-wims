"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Plus } from "lucide-react";
import { DataTable } from "./DataTable";
import type { PartyListRow } from "@/lib/db/queries/parties";

const ROLE_BADGE_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  supplier: { label: "Supplier", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  vendor: { label: "Vendor", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  customer: { label: "Customer", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  end_customer: { label: "End Customer", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  internal_supplies: { label: "Internal Supplies", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
};

const ROLE_FILTER_OPTIONS = Object.entries(ROLE_BADGE_STYLES).map(([value, style]) => ({
  value,
  label: style.label,
}));

import { ExportDataButton } from "@/components/shared/ExportDataButton";

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

    // 2. Organization Name
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
              <span className="block text-xs text-text-grey font-medium">
                Contact: {row.contactPerson} {row.email ? `(${row.email})` : ""}
              </span>
            )}
          </div>
        );
      },
    },

    // 3. Business Roles
    {
      id: "roles",
      header: "Business Roles",
      meta: {
        filterVariant: "multi-select",
        filterLabel: "Business Roles",
        filterOptions: ROLE_FILTER_OPTIONS,
      },
      cell: (info) => {
        const roles = info.row.original.roles ?? [];
        if (roles.length === 0) {
          return <span className="text-xs text-text-grey italic">None</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {roles.map((r) => {
              const style = ROLE_BADGE_STYLES[r] ?? {
                label: r.replace(/_/g, " "),
                bg: "bg-slate-100",
                text: "text-slate-700",
                border: "border-slate-200",
              };
              return (
                <span
                  key={r}
                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${style.bg} ${style.text} border ${style.border}`}
                >
                  {style.label}
                </span>
              );
            })}
          </div>
        );
      },
    },

    // 4. Email
    {
      accessorKey: "email",
      header: "Email",
      meta: {
        filterVariant: "text",
        filterLabel: "Email",
      },
      cell: (info) => <span className="font-mono text-sm text-text-grey">{String(info.getValue() || "—")}</span>,
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
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
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
        <span className="font-mono text-sm text-text-grey font-medium">
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
              className="rounded bg-slate-100 hover:bg-brand-navy hover:text-white px-2.5 py-1 text-xs font-bold text-slate-800 transition-colors shadow-sm"
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
      subtitle="Master directory of Suppliers, Customers, End-Customers, and Internal Supplies organizations"
      icon={<Building2 size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <ExportDataButton
            data={data}
            filename="organizations_directory"
            sheetName="Organizations"
            buttonLabel="Export Orgs"
            columns={[
              { header: "Code", key: "code" },
              { header: "Name", key: "name" },
              { header: "Roles", format: (r) => (r.roles || []).join(", ") },
              { header: "Contact Person", key: "contactPerson" },
              { header: "Email", key: "email" },
              { header: "Status", format: (r) => (r.isActive ? "Active" : "Inactive") },
              { header: "Enrolled Date", format: (r) => new Date(r.createdAt).toISOString().split("T")[0] },
            ]}
          />
          {canManage && (
            <Link
              href="/master-data/parties/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-surface-white hover:bg-primary/90 transition-all shadow-sm"
            >
              <Plus size={14} /> New Organization
            </Link>
          )}
        </div>
      }
      emptyMessage="No organizations found matching the specified filters."
    />
  );
}
