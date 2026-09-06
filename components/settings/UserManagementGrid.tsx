"use client";

import { useMemo, useState, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  UserPlus,
  Sliders,
  Search,
  Smartphone,
  CheckCircle2,
  Shield,
  FileText,
  Clock,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { roleLabel } from "@/lib/user-settings/roles";
import { InviteUserModal } from "./InviteUserModal";
import { SuspendUserDialog } from "./SuspendUserDialog";
import { UserAuditDrawer } from "./UserAuditDrawer";
import { RoleManagementModal } from "./RoleManagementModal";
import { TablePagination } from "@/components/ui/TablePagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  ActivePartyOption,
  TeamMember,
  DynamicRole,
} from "@/app/(authenticated)/settings/team/actions";
import { listRoles, listTeamMembers } from "@/app/(authenticated)/settings/team/actions";
import type { InviteUserInput } from "@/lib/user-settings/schemas";

export function UserManagementGrid({
  initialMembers,
  parties,
  inviteUser,
  suspendUser,
  reactivateUser,
}: {
  initialMembers: TeamMember[];
  parties: ActivePartyOption[];
  inviteUser: (input: InviteUserInput) => Promise<{ ok: boolean; error?: string }>;
  suspendUser: (input: { userId: string; reason: string }) => Promise<{ ok: boolean; error?: string }>;
  reactivateUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<TeamMember | null>(null);
  const [auditTarget, setAuditTarget] = useState<TeamMember | null>(null);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);

  useEffect(() => {
    listRoles().then((res) => {
      if (res.ok) setRoles(res.data);
    });
  }, []);

  function refreshData() {
    listTeamMembers().then((res) => {
      if (res.ok) setMembers(res.data);
    });
    listRoles().then((res) => {
      if (res.ok) setRoles(res.data);
    });
  }

  async function handleReactivate(member: TeamMember) {
    const res = await reactivateUser(member.id);
    if (res.ok) {
      setMembers((curr) =>
        curr.map((m) => (m.id === member.id ? { ...m, status: "active" } : m)),
      );
    }
  }

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!globalFilter) return true;
      const search = globalFilter.toLowerCase();
      return (
        m.displayName.toLowerCase().includes(search) ||
        (m.email?.toLowerCase().includes(search) ?? false) ||
        m.employeeId.toLowerCase().includes(search) ||
        m.roleKeys.some((r) => r.toLowerCase().includes(search))
      );
    });
  }, [members, statusFilter, globalFilter]);

  const columns = useMemo<ColumnDef<TeamMember>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: "User & Identity",
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div
              onClick={() => setAuditTarget(m)}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 font-heading font-bold text-xs text-brand-navy border border-slate-200 group-hover:bg-brand-navy group-hover:text-white transition-colors">
                {m.displayName.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-heading text-xs font-bold text-slate-900 group-hover:text-brand-navy transition-colors">
                  <span>{m.displayName}</span>
                  <ChevronRight className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="font-mono text-[10px] font-semibold text-slate-500">
                  {m.employeeId}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "email",
        header: "Work Email",
        cell: ({ row }) => (
          <span className="font-body text-xs text-slate-600">
            {row.original.email || <span className="text-slate-400">—</span>}
          </span>
        ),
      },
      {
        id: "roles",
        header: "Assigned Dynamic Roles",
        cell: ({ row }) => {
          const userRoles = row.original.roleKeys;
          return (
            <div className="flex flex-wrap gap-1.5">
              {userRoles.map((r) => (
                <span
                  key={r}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 font-label text-[10px] font-bold text-slate-700 uppercase tracking-wide border border-slate-200/60"
                >
                  {roleLabel(r)}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: "session",
        header: "Active Device / Session",
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  m.sessionStatus === "connected" ? "bg-emerald-500" : "bg-slate-300"
                }`}
              />
              <div>
                <span className="font-mono text-[11px] font-bold text-slate-800 block">
                  {m.sessionUuid}
                </span>
                <span className="font-body text-[10px] text-slate-400 block">
                  {m.activeDevice}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Account Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} size="sm" />,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAuditTarget(member)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-label text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
              >
                Audit Log
              </button>
              {member.status === "active" && (
                <button
                  type="button"
                  data-testid={`suspend-${member.id}`}
                  onClick={() => setSuspendTarget(member)}
                  className="rounded-lg px-2.5 py-1 font-label text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Suspend
                </button>
              )}
              {member.status === "inactive" && (
                <button
                  type="button"
                  data-testid={`reactivate-${member.id}`}
                  onClick={() => handleReactivate(member)}
                  className="rounded-lg px-2.5 py-1 font-label text-xs font-semibold text-primary hover:bg-blue-50"
                >
                  Reactivate
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredMembers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 8 },
    },
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-heading text-lg font-bold text-slate-900">
                Team &amp; Dynamic RBAC Directory
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                {members.length} operators
              </span>
            </div>
            <p className="mt-0.5 font-body text-xs text-slate-500">
              Searchable employee accounts directory, dynamic role management, and granular permission matrices.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setRolesModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-label text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              <Sliders className="h-4 w-4 text-slate-500" />
              Dynamic Roles &amp; Permissions
            </button>
            <button
              type="button"
              data-testid="open-invite-user"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-4 py-2 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Invite Operator
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              data-testid="team-search-input"
              placeholder="Search by Name, Employee ID, Email, or Role..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            />
          </div>

          <select
            data-testid="team-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
          >
            <option value="all">All Account Statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="invited">invited</option>
          </select>
        </div>

        {/* TanStack Data Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                {table.getHeaderGroups()[0]?.headers.map((h) => (
                  <th key={h.id} className="py-3 px-3">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-10 text-center text-xs text-slate-500">
                    No team members match your search.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-3 px-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        <div className="pt-2">
          <TablePagination
            pageIndex={table.getState().pagination.pageIndex}
            pageCount={table.getPageCount()}
            totalCount={table.getFilteredRowModel().rows.length}
            canPreviousPage={table.getCanPreviousPage()}
            canNextPage={table.getCanNextPage()}
            pageSize={table.getState().pagination.pageSize}
            onPageChange={(page) => table.setPageIndex(page)}
            onPageSizeChange={(size) => table.setPageSize(size)}
          />
        </div>
      </section>

      {/* Invite Modal */}
      {inviteOpen && (
        <InviteUserModal
          parties={parties}
          onClose={() => setInviteOpen(false)}
          onInvite={async (input) => {
            const res = await inviteUser(input);
            if (res.ok) {
              setInviteOpen(false);
              refreshData();
            }
            return res;
          }}
        />
      )}

      {/* Suspend Confirmation Dialog */}
      {suspendTarget && (
        <SuspendUserDialog
          displayName={suspendTarget.displayName}
          onCancel={() => setSuspendTarget(null)}
          onConfirm={async (reason) => {
            const targetId = suspendTarget.id;
            const res = await suspendUser({ userId: targetId, reason });
            if (res.ok) {
              setMembers((curr) =>
                curr.map((m) => (m.id === targetId ? { ...m, status: "inactive" } : m)),
              );
              setSuspendTarget(null);
              refreshData();
            }
            return res;
          }}
        />
      )}

      {/* Per-User Audit Drawer */}
      <UserAuditDrawer
        user={auditTarget}
        onClose={() => setAuditTarget(null)}
      />

      {/* Dynamic Roles & Permission Matrix Modal */}
      <RoleManagementModal
        isOpen={rolesModalOpen}
        onClose={() => setRolesModalOpen(false)}
        roles={roles}
        onRolesUpdated={refreshData}
      />
    </div>
  );
}
