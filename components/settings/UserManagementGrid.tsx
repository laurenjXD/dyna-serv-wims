"use client";

import { toUserMessage } from "@/lib/ui/user-messages";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  UserPlus,
  Sliders,
  Search,
  ChevronRight,
  Mail,
  UserX,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
} from "@/components/ui/icons";
import { roleLabel } from "@/lib/user-settings/roles";
import { InviteUserModal } from "./InviteUserModal";
import { SuspendUserDialog } from "./SuspendUserDialog";
import { CancelInviteDialog } from "./CancelInviteDialog";
import { UserAuditDrawer } from "./UserAuditDrawer";
import { RoleManagementModal } from "./RoleManagementModal";
import { UserAccessModal } from "./UserAccessModal";
import { TablePagination } from "@/components/ui/TablePagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  ActivePartyOption,
  TeamMember,
  DynamicRole,
} from "@/app/(authenticated)/settings/team/actions";
import {
  listRoles,
  listTeamMembers,
  resendInvite as defaultResendInvite,
  cancelInvite as defaultCancelInvite,
} from "@/app/(authenticated)/settings/team/actions";
import type { InviteUserInput } from "@/lib/user-settings/schemas";

export function UserManagementGrid({
  initialMembers,
  parties,
  inviteUser,
  suspendUser,
  reactivateUser,
  resendInvite = defaultResendInvite,
  cancelInvite = defaultCancelInvite,
  canManageAccess = false,
}: {
  canManageAccess?: boolean;
  initialMembers: TeamMember[];
  parties: ActivePartyOption[];
  inviteUser: (input: InviteUserInput) => Promise<{ ok: boolean; error?: string }>;
  suspendUser: (input: { userId: string; reason: string }) => Promise<{ ok: boolean; error?: string }>;
  reactivateUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  resendInvite?: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  cancelInvite?: (userId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<TeamMember | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TeamMember | null>(null);
  const [auditTarget, setAuditTarget] = useState<TeamMember | null>(null);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [accessTarget, setAccessTarget] = useState<TeamMember | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    listRoles().then((res) => {
      if (res.ok) setRoles(res.data);
      else setFeedback({ type: "error", message: toUserMessage(res.error, "Team information could not be loaded. Refresh the page and try again.") });
    }).catch(() => setFeedback({ type: "error", message: "Team information could not be loaded. Refresh the page and try again." }));
  }, []);

  function refreshData() {
    listTeamMembers().then((res) => {
      if (res.ok) setMembers(res.data);
      else setFeedback({ type: "error", message: toUserMessage(res.error, "The Team directory could not be refreshed. Try again.") });
    }).catch(() => setFeedback({ type: "error", message: "The Team directory could not be refreshed. Try again." }));
    listRoles().then((res) => {
      if (res.ok) setRoles(res.data);
      else setFeedback({ type: "error", message: toUserMessage(res.error, "Team information could not be loaded. Refresh the page and try again.") });
    }).catch(() => setFeedback({ type: "error", message: "Team information could not be loaded. Refresh the page and try again." }));
  }

  const handleReactivate = useCallback(async (member: TeamMember) => {
    setFeedback(null);
    try {
      const res = await reactivateUser(member.id);
      if (res.ok) {
        setMembers((curr) =>
          curr.map((m) => (m.id === member.id ? { ...m, status: "active" } : m)),
        );
        setFeedback({ type: "success", message: `${member.displayName}’s account reactivated.` });
      } else {
        setFeedback({ type: "error", message: toUserMessage(res.error, "The account could not be reactivated. Refresh the page and try again.") });
      }
    } catch {
      setFeedback({ type: "error", message: "The reactivation request failed. Check the connection and try again." });
    }
  }, [reactivateUser]);

  const handleResendInvite = useCallback(async (member: TeamMember) => {
    setResendingId(member.id);
    setFeedback(null);
    try {
      const res = await resendInvite(member.id);
      if (res.ok) {
        setFeedback({
          type: "success",
          message: `Invitation sent to ${member.email || member.displayName}. Ask the team member to check their inbox and spam folder.`,
        });
      } else {
        setFeedback({
          type: "error",
          message: toUserMessage(res.error, "The invitation could not be resent. Try again. If it happens again, contact an administrator."),
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "The invitation could not be resent. Try again. If it happens again, contact an administrator.",
      });
    } finally {
      setResendingId(null);
    }
  }, [resendInvite]);

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
            {row.original.email || <span className="text-slate-400">â€”</span>}
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
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-label text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
              >
                Audit Log
              </button>
              {canManageAccess && (
                <button type="button" className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2 font-label text-label text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setAccessTarget(member)}>Manage Access</button>
              )}
              {canManageAccess && member.status === "invited" && (
                <>
                  <button
                    type="button"
                    data-testid={`resend-invite-${member.id}`}
                    disabled={resendingId === member.id}
                    onClick={() => handleResendInvite(member)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-label text-xs font-semibold text-brand-navy hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50"
                    title="Resend invitation link"
                  >
                    {resendingId === member.id ? (
                      <Loader2 className="h-3 w-3 animate-spin text-brand-navy" />
                    ) : (
                      <Mail className="h-3 w-3 text-brand-navy" />
                    )}
                    <span>{resendingId === member.id ? "Sendingâ€¦" : "Resend Invite"}</span>
                  </button>
                  <button
                    type="button"
                    data-testid={`cancel-invite-${member.id}`}
                    onClick={() => setCancelTarget(member)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-label text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Cancel pending invitation"
                  >
                    <UserX className="h-3 w-3 text-rose-500" />
                    <span>Cancel Invite</span>
                  </button>
                </>
              )}
              {canManageAccess && member.status === "active" && (
                <button
                  type="button"
                  data-testid={`suspend-${member.id}`}
                  onClick={() => setSuspendTarget(member)}
                  className="rounded-lg px-2.5 py-1 font-label text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Suspend
                </button>
              )}
              {canManageAccess && member.status === "inactive" && (
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
    [resendingId, canManageAccess, handleReactivate, handleResendInvite],
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
    <div className="min-w-0 max-w-full space-y-6">
      {/* Action Notification Banner */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl p-3.5 text-xs font-medium border shadow-2xs transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-rose-50 text-rose-900 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <section className="min-w-0 max-w-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-heading text-lg font-bold text-slate-900">
                Team &amp; Dynamic RBAC Directory
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                {members.length} operators
              </span>
            </div>
            <p className="mt-0.5 font-body text-xs text-slate-500">
              Searchable employee accounts directory, configurable role assignment, and effective permissions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setRolesModalOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 font-label text-label text-text-primary shadow-elevation-1 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Sliders className="h-4 w-4 text-slate-500" />
              {canManageAccess ? "Manage Roles" : "Role Capability Reference"}
            </button>
            {canManageAccess && <button
              type="button"
              data-testid="open-invite-user"
              onClick={() => setInviteOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-navy px-4 py-2 font-label text-label text-white shadow-elevation-1 hover:bg-brand-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <UserPlus className="h-4 w-4" />
              Invite Operator
            </button>}
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
        <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
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
                    No team members match your search. Clear the search or change the filters.
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

      {/* Cancel Invite Dialog */}
      {cancelTarget && (
        <CancelInviteDialog
          displayName={cancelTarget.displayName}
          email={cancelTarget.email}
          onCancel={() => setCancelTarget(null)}
          onConfirm={async () => {
            const targetId = cancelTarget.id;
            const res = await cancelInvite(targetId);
            if (res.ok) {
              setMembers((curr) => curr.map((m) => m.id === targetId ? { ...m, status: "inactive", roleKeys: [], partyNames: [] } : m));
              setCancelTarget(null);
              setFeedback({
                type: "success",
                message: `Invitation for ${cancelTarget.displayName} was cancelled. The account is retained as inactive.`,
              });
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
        canManageAccess={canManageAccess}
        onSaved={refreshData}
      />
      {canManageAccess && <UserAccessModal isOpen={Boolean(accessTarget)} member={accessTarget} roles={roles} onClose={() => setAccessTarget(null)} onSaved={refreshData} />}
    </div>
  );
}
