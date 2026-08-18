// <UserManagementGrid> — searchable/filterable data table of all users, with
// row-level Suspend/Reactivate actions and the "Invite User" entry point.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.2, §2.2,
// tasks.md Tasks 21.6/21.8. FR-3.1 ("searchable, filterable data grid").
//
// This is an office/admin surface — a dense multi-column table is the
// correct pattern here (brand-design-system.md §9: "Floor screens avoid
// dense tables entirely... floor equivalents should be card-based lists" —
// the corollary is that a table IS the right office pattern, which this
// is). Epilogue SemiBold uppercase headers, Outfit Regular body, Roboto
// Mono for the id column, per brand-design-system.md §9's Tables guidance.

"use client";

import { useMemo, useState } from "react";
import { roleLabel } from "@/lib/user-settings/roles";
import { InviteUserModal } from "./InviteUserModal";
import { SuspendUserDialog } from "./SuspendUserDialog";
import type {
  ActivePartyOption,
  TeamMember,
} from "@/app/(authenticated)/settings/team/actions";
import type { InviteUserInput } from "@/lib/user-settings/schemas";

// bg-status-*/15 tints are all near-white — pairing them with the raw
// text-status-* color (as this badge originally did) fails WCAG AA 4.5:1
// for every status (measured 1.9:1-3.95:1, design-system-auditor finding,
// 2026-08-08). Solid bg-status-* + text-surface-white doesn't fix this
// uniformly either: status-available/held/pending are all too light for
// white text to reach 4.5:1 (2.1-3.8:1), while status-neutral only reaches
// 4.5:1 that way (4.76:1) and fails with dark text. Rather than branch the
// pairing per status, `text-on-surface` (near-black) on the existing
// bg-status-*/15 tint clears 4.5:1 for all four with wide margin
// (~14-15:1, since the tints are all so close to white) — the status color
// still carries meaning via the tint background and the icon glyph, so
// this doesn't fall back to color-only signaling (§1.3/§9).
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-status-available/15",
    invited: "bg-status-pending/15",
    inactive: "bg-status-held/15",
  };
  const iconColor: Record<string, string> = {
    active: "text-status-available",
    invited: "text-status-pending",
    inactive: "text-status-held",
  };
  const icon: Record<string, string> = {
    active: "●",
    invited: "◐",
    inactive: "■",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-label uppercase tracking-wide text-on-surface ${
        styles[status] ?? "bg-status-neutral/15"
      }`}
    >
      {/* Status is never color-only (brand-design-system.md §1.3/§9) — the
          glyph is the non-color signal alongside the badge's tint color. */}
      <span aria-hidden="true" className={iconColor[status] ?? "text-status-neutral"}>
        {icon[status] ?? "●"}
      </span>
      {status}
    </span>
  );
}

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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<TeamMember | null>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return members.filter((member) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        member.displayName.toLowerCase().includes(normalizedQuery) ||
        (member.email ?? "").toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || member.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [members, query, statusFilter]);

  async function handleInvite(input: InviteUserInput) {
    const result = await inviteUser(input);
    if (result.ok) {
      // A freshly invited user isn't visible via the client-side list
      // without a refetch (the server action doesn't return the new row
      // shape) — a full reload of team data is the correct source of
      // truth here rather than optimistically constructing a TeamMember.
      window.location.reload();
    }
    return result;
  }

  async function handleSuspendConfirm(reason: string) {
    if (!suspendTarget) return { ok: false, error: "No user selected" };
    const result = await suspendUser({ userId: suspendTarget.id, reason });
    if (result.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.id === suspendTarget.id ? { ...m, status: "inactive" } : m)),
      );
      setSuspendTarget(null);
    }
    return result;
  }

  async function handleReactivate(member: TeamMember) {
    const result = await reactivateUser(member.id);
    if (result.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, status: "active" } : m)),
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-center">
        <h1 className="font-heading text-headline-md font-semibold text-on-surface">
          Team Members
        </h1>
        <button
          type="button"
          data-testid="open-invite-user"
          onClick={() => setInviteOpen(true)}
          className="flex min-h-11 items-center justify-center rounded bg-brand-red px-4 font-label text-label uppercase tracking-wide text-surface-white hover:bg-brand-red/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          Invite User
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <input
          type="search"
          data-testid="team-search-input"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 flex-1 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        />
        <select
          data-testid="team-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-11 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <table className="w-full text-left" data-testid="user-management-table">
          <thead>
            <tr className="border-b border-outline-variant/30">
              <th className="px-4 py-3 font-label text-label uppercase tracking-wide text-text-grey">
                Name
              </th>
              <th className="px-4 py-3 font-label text-label uppercase tracking-wide text-text-grey">
                Email
              </th>
              <th className="px-4 py-3 font-label text-label uppercase tracking-wide text-text-grey">
                Role
              </th>
              <th className="px-4 py-3 font-label text-label uppercase tracking-wide text-text-grey">
                Organization
              </th>
              <th className="px-4 py-3 font-label text-label uppercase tracking-wide text-text-grey">
                Status
              </th>
              <th className="px-4 py-3 font-label text-label uppercase tracking-wide text-text-grey">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((member) => (
              <tr key={member.id} className="border-b border-outline-variant/30 last:border-0">
                <td className="px-4 py-3 font-body text-body-md text-on-surface">
                  {member.displayName}
                </td>
                {/* Outfit Regular body per brand-design-system.md §9's
                    Tables guidance — email is not an id/code/quantity
                    column, so it does not get Roboto Mono. */}
                <td className="px-4 py-3 font-body text-body-md text-on-surface">
                  {member.email ?? "—"}
                </td>
                <td className="px-4 py-3 font-body text-body-md text-on-surface">
                  {member.roleKeys.length > 0
                    ? member.roleKeys.map(roleLabel).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 font-body text-body-md text-on-surface">
                  {member.partyNames.length > 0 ? member.partyNames.join(", ") : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={member.status} />
                </td>
                <td className="px-4 py-3">
                  {member.status === "inactive" ? (
                    <button
                      type="button"
                      data-testid={`reactivate-${member.id}`}
                      onClick={() => handleReactivate(member)}
                      className="font-label text-label uppercase tracking-wide text-status-available hover:underline"
                    >
                      Reactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid={`suspend-${member.id}`}
                      onClick={() => setSuspendTarget(member)}
                      // Destructive action -> status-held, not brand-red,
                      // per brand-design-system.md §9 ("Destructive:
                      // status-held solid").
                      className="font-label text-label uppercase tracking-wide text-status-held hover:underline"
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center font-body text-body-md text-text-grey"
                >
                  No team members match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
