"use client";

import { toUserMessage } from "@/lib/ui/user-messages";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "@/components/ui/icons";
import {
  deleteDynamicRole,
  listPermissionCatalog,
  saveDynamicRole,
  type DynamicRole,
  type EffectiveGrant,
  type PermissionOption,
} from "@/app/(authenticated)/settings/team/actions";

export const scopeLabel = (scope: string) => scope === "global" ? "Warehouse-wide" : "Assigned Organizations";
const grantKey = (grant: { permissionId: string; scopeKind: string }) => `${grant.permissionId}:${grant.scopeKind}`;
const button = "min-h-11 rounded-lg border border-border px-4 py-2 font-label text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";
const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 font-body text-body-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:bg-background";

// A small office dialog shared by the two access editors. Focus is contained,
// Escape closes it outside a pending mutation, and closing restores focus.
export function AccessDialog({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 sm:p-6">
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} className="max-h-full w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-surface shadow-elevation-2 outline-none">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4 sm:px-6">
          <h2 id={titleId} className="font-heading text-headline-sm text-heading">{title}</h2>
          <button type="button" className={`${button} flex min-w-11 items-center justify-center px-2`} aria-label="Close access editor" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function GrantList({ grants }: { grants: EffectiveGrant[] }) {
  if (grants.length === 0) return <p className="font-body text-body-sm text-text-secondary">No permissions granted.</p>;
  return <ul className="divide-y divide-border rounded-lg border border-border">{grants.map((grant) => <li key={grantKey(grant)} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-body text-body-sm"><code className="break-all font-body text-body-sm text-text-primary">{grant.resource}.{grant.action}</code><span className="text-text-secondary">{scopeLabel(grant.scopeKind)}</span></li>)}</ul>;
}

interface RoleManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: DynamicRole[];
  canManageAccess?: boolean;
  onSaved?: () => void;
}

export function RoleManagementModal({ isOpen, onClose, roles, canManageAccess = false, onSaved }: RoleManagementModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!isOpen) return null;
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0] ?? null;
  const creating = selectedId === "__new__";
  return <AccessDialog title="Roles & permissions" onClose={onClose} busy={busy}>
    <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-3">
      <div className="space-y-3">
        <h3 className="font-heading text-body-md text-heading">Role catalog</h3>
        {canManageAccess && <button className={`${button} w-full bg-brand-navy text-white`} type="button" disabled={busy} onClick={() => setSelectedId("__new__")}>Create role</button>}
        <div className="space-y-2">{roles.map((role) => <button key={role.id} type="button" disabled={busy} aria-pressed={!creating && selected?.id === role.id} onClick={() => setSelectedId(role.id)} className={`${button} w-full text-left ${!creating && selected?.id === role.id ? "bg-background text-heading" : "bg-surface text-text-primary"}`}><span className="block break-words">{role.name}</span><span className="block font-body text-body-sm text-text-secondary">{role.isSystem ? "Protected system role" : "Custom role"}{!role.isActive ? " · Inactive" : ""}</span></button>)}</div>
      </div>
      <div className="min-w-0 md:col-span-2">
        {!selected && !creating ? <p className="font-body text-body-sm text-text-secondary">No roles are available.</p> : <RoleEditor key={creating ? "__new__" : selected?.id} role={creating ? null : selected} canManageAccess={canManageAccess} onBusy={setBusy} onSaved={() => { onSaved?.(); onClose(); }} />}
      </div>
    </div>
  </AccessDialog>;
}

function RoleEditor({ role, canManageAccess, onBusy, onSaved }: { role: DynamicRole | null; canManageAccess: boolean; onBusy: (busy: boolean) => void; onSaved: () => void }) {
  const editable = canManageAccess && !role?.isSystem;
  const [key, setKey] = useState(role?.key ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [grants, setGrants] = useState((role?.grants ?? []).map(({ permissionId, scopeKind }) => ({ permissionId, scopeKind })));
  const [catalog, setCatalog] = useState<PermissionOption[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!editable) return;
    let active = true;
    listPermissionCatalog().then((result) => {
      if (!active) return;
      if (result.ok) setCatalog(result.data);
      else setCatalogError(toUserMessage(result.error, "Permissions could not be loaded. Close and reopen the role editor."));
    }).catch(() => { if (active) setCatalogError("Permission catalog could not be loaded. Check your connection and reopen the editor."); });
    return () => { active = false; };
  }, [editable]);
  const mixedScopes = new Set(grants.map((grant) => grant.scopeKind)).size > 1;
  const ready = confirmed && reason.trim().length >= 3 && reason.trim().length <= 1000 && !pending;
  async function mutate(deactivate: boolean) {
    if (!ready || !editable) return;
    setPending(true); onBusy(true); setError(null);
    try {
      const result = deactivate && role ? await deleteDynamicRole(role.id, reason.trim()) : await saveDynamicRole({ ...(role ? { id: role.id } : {}), key, name, description, grants, reason: reason.trim() });
      if (result.ok) onSaved();
      else setError(toUserMessage(result.error, "The role could not be saved. Review your changes and try again."));
    } catch { setError("The change could not be saved. Check your connection and try again."); }
    finally { setPending(false); onBusy(false); }
  }
  if (!editable) return <div className="space-y-4"><h3 className="font-heading text-headline-sm text-heading">{role?.name}</h3><p className="font-body text-body-sm text-text-secondary">{role?.description}</p>{role?.isSystem && <p className="rounded-lg bg-background p-3 font-body text-body-sm text-text-primary">System roles are protected. Create a custom role for a different permission bundle.</p>}<h4 className="font-label text-label text-heading">Exact permissions</h4><GrantList grants={role?.grants ?? []} /></div>;
  return <form onSubmit={(event) => { event.preventDefault(); void mutate(false); }} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 font-label text-label text-heading">Role key<input className={input} value={key} onChange={(event) => setKey(event.target.value)} disabled={Boolean(role) || pending} required pattern="[a-z][a-z0-9_]+" minLength={2} maxLength={100} /></label>
      <label className="space-y-1 font-label text-label text-heading">Role name<input className={input} value={name} onChange={(event) => setName(event.target.value)} disabled={pending} required minLength={2} maxLength={255} /></label>
    </div>
    <label className="block space-y-1 font-label text-label text-heading">Description<textarea className={input} value={description} onChange={(event) => setDescription(event.target.value)} disabled={pending} maxLength={2000} /></label>
    <div className="rounded-lg bg-background p-3 font-body text-body-sm text-text-primary">Permissions combine across assigned roles. Warehouse-wide permissions apply across Organizations. Assigned Organization permissions are limited by each account’s active Organization and Inventory Model scope. Scoped and warehouse-wide grants cannot be mixed in one role. Organization accounts must keep scoped access. Removing a grant here changes access for every account assigned this role.</div>
    <fieldset disabled={pending || !catalog} className="space-y-3">
      <legend className="font-label text-label text-heading">Permissions ({grants.length} selected)</legend>
      {catalogError ? <p role="alert" className="font-body text-body-sm text-status-held">{catalogError}</p> : !catalog ? <p role="status" className="font-body text-body-sm text-text-secondary">Loading permission catalog…</p> : <>
        <label className="block font-label text-label text-heading">Find permissions<input className={input} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Resource or action" /></label>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-border">{catalog.filter((option) => `${option.resource}.${option.action}`.includes(filter.toLowerCase())).map((option) => <label key={grantKey(option)} className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-border px-3 py-3 last:border-0"><input type="checkbox" className="mt-1 h-5 w-5 accent-primary" aria-label={`${option.resource}.${option.action} — ${scopeLabel(option.scopeKind)}`} checked={grants.some((grant) => grantKey(grant) === grantKey(option))} onChange={(event) => setGrants((current) => event.target.checked ? [...current, { permissionId: option.permissionId, scopeKind: option.scopeKind }] : current.filter((grant) => grantKey(grant) !== grantKey(option)))} /><span className="min-w-0"><code className="block break-all font-body text-body-sm text-text-primary">{option.resource}.{option.action}</code><span className="block font-body text-body-sm text-text-secondary">{scopeLabel(option.scopeKind)}{option.description ? ` · ${option.description}` : ""}</span></span></label>)}</div>
      </>}
    </fieldset>
    {mixedScopes && <p role="alert" className="font-body text-body-sm text-status-held">Choose either warehouse-wide or assigned Organization permissions for this role.</p>}
    <label className="block space-y-1 font-label text-label text-heading">Reason for change<textarea className={input} required value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} maxLength={1000} minLength={3} /></label>
    <label className="flex min-h-11 items-center gap-3 font-body text-body-sm text-text-primary"><input type="checkbox" className="h-5 w-5 accent-primary" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending} />I confirm these access changes and their effect on assigned accounts.</label>
    {error && <p role="alert" className="font-body text-body-sm text-status-held">{error}</p>}
    <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
      {role?.isActive && <button className={`${button} bg-surface text-status-held`} type="button" disabled={!ready} onClick={() => void mutate(true)}>Deactivate role</button>}
      <button className={`${button} bg-brand-navy text-white`} type="submit" disabled={!ready || mixedScopes || !catalog || Boolean(catalogError)}>{pending ? "Saving…" : role && !role.isActive ? "Reactivate role" : "Save role"}</button>
    </div>
  </form>;
}
