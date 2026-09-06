// <UserManagementGrid> — searchable/filterable data table of all users, with
// row-level Suspend/Reactivate actions and the "Invite User" entry point.
// Powered by TanStack Table (@tanstack/react-table).
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.2, §2.2,
// tasks.md Tasks 21.6/21.8. FR-3.1 ("searchable, filterable data grid").

"use client";

import { useMemo, useState } from "react";
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
import { roleLabel } from "@/lib/user-settings/roles";
import { InviteUserModal } from "./InviteUserModal";
import { SuspendUserDialog } from "./SuspendUserDialog";
import { TablePagination } from "@/components/ui/TablePagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  ActivePartyOption,
  TeamMember,
} from "@/app/(authenticated)/settings/team/actions";
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
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<TeamMember | null>(null);

  const columns = useMemo<ColumnDef<TeamMember>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: "Name",
        cell: ({ row }) => (
          <div className="font-heading text-sm font-semibold text-text-primary">
            {row.original.displayName}
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <div className="font-body text-xs text-text-secondary">
            {row.original.email ?? "—"}
          </div>
        ),
      },
      {
        id: "roles",
        header: "Role",
        cell: ({ row }) => {
          const roles = row.original.roleKeys;
          if (roles.length === 0) return <span className="text-slate-400">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-slate-100 px-2 py-0.5 font-label text-[11px] font-semibold text-slate-700 uppercase"
                >
                  {roleLabel(r)}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: "parties",
        header: "Organizations",
        cell: ({ row }) => {
          const names = row.original.partyNames;
          if (names.length === 0) {
            return <span className="text-slate-400 text-xs">Internal</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {names.map((n) => (
                <span
                  key={n}
                  className="rounded bg-slate-100 px-2 py-0.5 font-body text-xs text-slate-700"
                >
                  {n}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} size="sm" />,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="flex items-center gap-2">
              {member.status === "active" && (
                <button
                  type="button"
                  data-testid={`suspend-${member.id}`}
                  onClick={() => setSuspendTarget(member)}
                  className="rounded px-2.5 py-1 font-label text-xs font-semibold text-error hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-error"
                >
                  Suspend
                </button>
              )}
              {member.status === "inactive" && (
                <button
                  type="button"
                  data-testid={`reactivate-${member.id}`}
                  onClick={() => handleReactivate(member)}
                  className="rounded px-2.5 py-1 font-label text-xs font-semibold text-primary hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Reactivate
                </button>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  const filteredData = useMemo(() => {
    return members.filter((member) => {
      const matchesStatus =
        statusFilter === "all" || member.status === statusFilter;
      const normalizedQuery = globalFilter.trim().toLowerCase();
      const matchesQuery =
        normalizedQuery.length === 0 ||
        member.displayName.toLowerCase().includes(normalizedQuery) ||
        (member.email ?? "").toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [members, globalFilter, statusFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  async function handleInvite(input: InviteUserInput) {
    const result = await inviteUser(input);
    if (result.ok) {
      window.location.reload();
    }
    return result;
  }

  async function handleSuspendConfirm(reason: string) {
    if (!suspendTarget) return { ok: false, error: "No user selected" };
    const result = await suspendUser({ userId: suspendTarget.id, reason });
    if (result.ok) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === suspendTarget.id ? { ...m, status: "inactive" } : m
        )
      );
      setSuspendTarget(null);
    }
    return result;
  }

  async function handleReactivate(member: TeamMember) {
    const result = await reactivateUser(member.id);
    if (result.ok) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, status: "active" } : m
        )
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-center">
        <h1 className="font-heading text-headline-md font-semibold text-text-primary">
          Team Members
        </h1>
        <button
          type="button"
          data-testid="open-invite-user"
          onClick={() => setInviteOpen(true)}
          className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-label text-label uppercase tracking-wide text-white hover:bg-primary-hover shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Invite User
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <input
          type="search"
          data-testid="team-search-input"
          placeholder="Search by name or email"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="min-h-11 flex-1 rounded-xl border border-border bg-surface px-3 py-2 font-body text-body-md text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <select
          data-testid="team-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-11 rounded-xl border border-border bg-surface px-3 py-2 font-body text-body-md text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-elevation-1">
        <table className="w-full text-left" data-testid="user-management-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-[#F4F6FB]">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 font-heading text-xs font-bold uppercase tracking-wider text-slate-700 select-none cursor-pointer"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1.5">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: " ↑",
                        desc: " ↓",
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border/60">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center font-body text-sm text-text-secondary"
                >
                  No team members match your search.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`user-row-${row.original.id}`}
                  className="hover:bg-slate-50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {filteredData.length > 0 && (
          <div className="p-3 border-t border-border">
            <TablePagination
              pageIndex={table.getState().pagination.pageIndex}
              pageSize={table.getState().pagination.pageSize}
              pageCount={table.getPageCount()}
              totalCount={filteredData.length}
              canPreviousPage={table.getCanPreviousPage()}
              canNextPage={table.getCanNextPage()}
              onPageChange={(p) => table.setPageIndex(p)}
              onPageSizeChange={(newSize) => table.setPageSize(newSize)}
            />
          </div>
        )}
      </div>

      {inviteOpen && (
        <InviteUserModal
          parties={parties}
          onClose={() => setInviteOpen(false)}
          onInvite={handleInvite}
        />
      )}

      {suspendTarget && (
        <SuspendUserDialog
          displayName={suspendTarget.displayName}
          onCancel={() => setSuspendTarget(null)}
          onConfirm={handleSuspendConfirm}
        />
      )}
    </div>
  );
}
