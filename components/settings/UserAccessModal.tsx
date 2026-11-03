"use client";

import { toUserMessage } from "@/lib/ui/user-messages";
import { useEffect, useState } from "react";
import { getUserAccess, replaceUserRoles, type DynamicRole, type EffectiveGrant, type TeamMember } from "@/app/(authenticated)/settings/team/actions";
import { AccessDialog, GrantList } from "./RoleManagementModal";

interface UserAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: TeamMember | null;
  roles: DynamicRole[];
  onSaved: () => void;
}
const button = "min-h-11 rounded-lg border border-border px-4 py-2 font-label text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";

export function UserAccessModal({ isOpen, onClose, member, roles, onSaved }: UserAccessModalProps) {
  if (!isOpen || !member) return null;
  return <AccountAccessEditor key={member.id} member={member} roles={roles} onClose={onClose} onSaved={onSaved} />;
}

function AccountAccessEditor({ member, roles, onClose, onSaved }: Omit<UserAccessModalProps, "isOpen" | "member"> & { member: TeamMember }) {
  const [roleIds, setRoleIds] = useState<string[] | null>(null);
  const [currentGrants, setCurrentGrants] = useState<EffectiveGrant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    getUserAccess(member.id).then((result) => {
      if (!active) return;
      if (result.ok) {
        setRoleIds(result.data.roleIds);
        setCurrentGrants(member.status === "active" ? result.data.grants : []);
      }
      else setLoadError(toUserMessage(result.error, "Account access could not be loaded. Close and reopen the editor."));
    }).catch(() => { if (active) setLoadError("Account access could not be loaded. Check your connection and reopen the editor."); });
    return () => { active = false; };
  }, [member.id, member.status]);
  const activeRoles = roles.filter((role) => role.isActive);
  const grants = new Map<string, EffectiveGrant>();
  for (const role of activeRoles.filter((role) => roleIds?.includes(role.id))) {
    for (const grant of role.grants) grants.set(`${grant.permissionId}:${grant.scopeKind}`, grant);
  }
  const preview = [...grants.values()].sort((a, b) => `${a.resource}.${a.action}.${a.scopeKind}`.localeCompare(`${b.resource}.${b.action}.${b.scopeKind}`));
  const unavailableRoles = roleIds?.filter((id) => !activeRoles.some((role) => role.id === id)) ?? [];
  const mixedScopes = new Set(preview.map((grant) => grant.scopeKind)).size > 1;
  const ready = !mixedScopes && roleIds !== null && unavailableRoles.length === 0 && reason.trim().length >= 3 && reason.trim().length <= 1000 && confirmed && !pending;
  async function save() {
    if (!ready || !roleIds) return;
    setPending(true); setError(null);
    try {
      const result = await replaceUserRoles({ userId: member.id, roleIds, reason: reason.trim() });
      if (result.ok) { onSaved(); onClose(); }
      else setError(toUserMessage(result.error, "Account access could not be saved. Review your changes and try again."));
    } catch { setError("Account access could not be saved. Check your connection and try again."); }
    finally { setPending(false); }
  }
  return <AccessDialog title={`Account access: ${member.displayName}`} onClose={onClose} busy={pending}>
    <div className="space-y-5 p-4 sm:p-6">
      {loadError ? <p role="alert" className="font-body text-body-sm text-status-held">{loadError}</p> : roleIds === null ? <p role="status" className="font-body text-body-sm text-text-secondary">Loading account access…</p> : <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <p className="rounded-lg bg-background p-3 font-body text-body-sm text-text-primary">Select one or more roles. Permissions combine across all selected roles; removing a role retains permissions supplied by another role. Saving takes effect on the account’s next protected request.</p>
        <fieldset disabled={pending} className="space-y-2">
          <legend className="mb-2 font-label text-label text-heading">Assigned roles</legend>
          {activeRoles.length === 0 && <p className="font-body text-body-sm text-text-secondary">No active roles are available.</p>}
          {activeRoles.map((role) => <label key={role.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3"><input type="checkbox" aria-label={role.name} className="mt-1 h-5 w-5 accent-primary" checked={roleIds.includes(role.id)} onChange={(event) => setRoleIds((current) => event.target.checked ? [...(current ?? []), role.id] : current?.filter((id) => id !== role.id) ?? [])} /><span className="min-w-0"><span className="block break-words font-label text-label text-heading">{role.name}</span><span className="block font-body text-body-sm text-text-secondary">{role.description}{role.isSystem ? " · Protected system role" : ""}</span></span></label>)}
        </fieldset>
        {unavailableRoles.length > 0 && <p role="alert" className="font-body text-body-sm text-status-held">Some assigned roles are unavailable in this catalog. Close and reload the Team directory before changing access.</p>}
        <section className="space-y-2" aria-label="Current effective permissions"><h3 className="font-heading text-body-md text-heading">Current effective permissions ({currentGrants.length})</h3><GrantList grants={currentGrants} /><p className="font-body text-body-sm text-text-secondary">Loaded from the server when this editor opened. {member.status !== "active" ? "This account is not active and cannot exercise assigned permissions until activated." : "Refresh the directory to review subsequent changes."}</p></section>
        <section className="space-y-2" aria-label="Proposed effective permissions"><h3 className="font-heading text-body-md text-heading">Proposed effective permissions ({preview.length})</h3><GrantList grants={preview} /><p className="font-body text-body-sm text-text-secondary">Assigned Organization grants use the account’s active Organization and Inventory Model scope. Organization accounts cannot receive warehouse-wide grants, and scoped and warehouse-wide roles cannot be combined. Scope is validated again when saving. {member.status !== "active" ? "These proposed permissions remain unavailable while the account is inactive or invited." : ""}</p></section>
        {mixedScopes && <p role="alert" className="font-body text-body-sm text-status-held">Scoped and warehouse-wide roles cannot be assigned together. Review the selected roles.</p>}
        {roleIds.length === 0 && <p className="rounded-lg border border-border p-3 font-body text-body-sm text-status-held">This account will have no role permissions. The last active administrator cannot be removed.</p>}
        <label className="block space-y-1 font-label text-label text-heading">Reason for change<textarea required disabled={pending} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} minLength={3} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 font-body text-body-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <label className="flex min-h-11 items-center gap-3 font-body text-body-sm text-text-primary"><input type="checkbox" className="h-5 w-5 accent-primary" disabled={pending} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm these access changes for this account.</label>
        {error && <p role="alert" className="font-body text-body-sm text-status-held">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-border pt-4"><button type="button" className={`${button} bg-surface text-text-primary`} onClick={onClose} disabled={pending}>Cancel</button><button type="submit" className={`${button} bg-brand-navy text-white`} disabled={!ready}>{pending ? "Saving…" : "Save account access"}</button></div>
      </form>}
    </div>
  </AccessDialog>;
}
