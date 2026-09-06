"use client";

import { useState } from "react";
import {
  X,
  Shield,
  Plus,
  Trash2,
  Copy,
  Check,
  Save,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { DynamicRole } from "@/app/(authenticated)/settings/team/actions";
import { saveDynamicRole, deleteDynamicRole } from "@/app/(authenticated)/settings/team/actions";

const MODULE_NAMES = [
  { id: "Dashboard", desc: "View metrics, financial cards, location heatmap, export PDF" },
  { id: "Receiving (WRR)", desc: "View incoming, scan/receive pallets, override discrepancies, sign off intake" },
  { id: "Master Inventory", desc: "View live stock, lot numbers, adjust stock counts, quarantine lots" },
  { id: "Outgoing & Picking", desc: "View pick lists, execute pick runs, assign staging bays, dispatch orders" },
  { id: "Approvals", desc: "View approval queue, approve stock scrap/holds, approve high-value discrepancies" },
  { id: "Documents", desc: "View uploaded PODs, upload new scans, delete document records" },
  { id: "Reports & Billing", desc: "View financial margins, run VMI billing reconciliations, issue invoices, download CSV/PDF" },
  { id: "Master Data", desc: "Register new SKUs, modify CBM rates, edit vendor contracts" },
];

const COLOR_OPTIONS = [
  { label: "Purple (Admin)", value: "bg-purple-100 text-purple-800 border-purple-200" },
  { label: "Blue (Supervisor)", value: "bg-blue-100 text-blue-800 border-blue-200" },
  { label: "Emerald (Floor/Ops)", value: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { label: "Amber (Audit)", value: "bg-amber-100 text-amber-800 border-amber-200" },
  { label: "Rose (Security)", value: "bg-rose-100 text-rose-800 border-rose-200" },
  { label: "Slate (Default)", value: "bg-slate-100 text-slate-800 border-slate-200" },
];

interface RoleManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: DynamicRole[];
  onRolesUpdated: () => void;
}

export function RoleManagementModal({
  isOpen,
  onClose,
  roles,
  onRolesUpdated,
}: RoleManagementModalProps) {
  const [selectedRole, setSelectedRole] = useState<DynamicRole>(roles[0] || null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  if (!isOpen || !selectedRole) return null;

  function handleCapabilityToggle(moduleName: string, capKey: "view" | "create" | "edit" | "approve" | "delete") {
    setSelectedRole((prev) => {
      const caps = [...prev.capabilities];
      const modIdx = caps.findIndex((c) => c.module === moduleName);
      if (modIdx >= 0) {
        caps[modIdx] = { ...caps[modIdx], [capKey]: !caps[modIdx][capKey] };
      } else {
        caps.push({
          module: moduleName,
          view: capKey === "view",
          create: capKey === "create",
          edit: capKey === "edit",
          approve: capKey === "approve",
          delete: capKey === "delete",
        });
      }
      return { ...prev, capabilities: caps };
    });
  }

  function handleCreateNew() {
    const newId = `role-${Date.now()}`;
    const newRole: DynamicRole = {
      id: newId,
      key: `custom_role_${Date.now().toString().slice(-4)}`,
      name: "New Custom Role",
      description: "Custom floor capability matrix definition.",
      color: "bg-slate-100 text-slate-800 border-slate-200",
      isSystem: false,
      capabilities: MODULE_NAMES.map((m) => ({
        module: m.id,
        view: true,
        create: false,
        edit: false,
        approve: false,
        delete: false,
      })),
    };
    setSelectedRole(newRole);
  }

  async function handleSave() {
    setIsSaving(true);
    setStatus(null);
    const res = await saveDynamicRole(selectedRole);
    setIsSaving(false);
    if (res.ok) {
      setStatus({ type: "success", message: "Role and permission matrix saved." });
      onRolesUpdated();
    } else {
      setStatus({ type: "error", message: res.error || "Failed to save role." });
    }
  }

  async function handleDelete() {
    if (selectedRole.isSystem) return;
    if (confirm(`Delete role "${selectedRole.name}"?`)) {
      setIsSaving(true);
      await deleteDynamicRole(selectedRole.id);
      setIsSaving(false);
      onRolesUpdated();
      setSelectedRole(roles[0]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#F8FAFC] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-slate-900">
                Dynamic Role Creator &amp; Permission Matrix
              </h3>
              <p className="font-body text-xs text-slate-500">
                Configure module-by-module capability toggles and role definitions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body: Two-Column Layout */}
        <div className="flex-1 overflow-y-auto grid md:grid-cols-[260px_1fr] divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {/* Left Rail: Roles List */}
          <div className="p-4 bg-[#F8FAFC]/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-label">
                Roles Catalog
              </span>
              <button
                type="button"
                onClick={handleCreateNew}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1 font-label text-[11px] font-bold text-white hover:bg-brand-navy/90 shadow-2xs"
              >
                <Plus className="h-3 w-3" />
                Add Role
              </button>
            </div>

            <div className="space-y-1.5">
              {roles.map((r) => {
                const isSelected = selectedRole.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedRole(r);
                      setStatus(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all text-xs ${
                      isSelected
                        ? "bg-white border-brand-navy shadow-sm ring-1 ring-brand-navy/10"
                        : "bg-white/60 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-heading font-bold text-slate-900 truncate">{r.name}</span>
                      {r.isSystem && (
                        <span className="rounded bg-slate-100 px-1 py-0.2 font-mono text-[9px] font-bold text-slate-500 uppercase">
                          System
                        </span>
                      )}
                    </div>
                    <p className="font-body text-[11px] text-slate-500 line-clamp-1">{r.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Rail: Role Config & Permission Matrix */}
          <div className="p-6 space-y-6 overflow-y-auto">
            {/* Identity & Color Badge */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                  Role Name
                </label>
                <input
                  type="text"
                  value={selectedRole.name}
                  onChange={(e) => setSelectedRole({ ...selectedRole, name: e.target.value })}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
                />
              </div>

              <div>
                <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                  Badge Color Style
                </label>
                <select
                  value={selectedRole.color}
                  onChange={(e) => setSelectedRole({ ...selectedRole, color: e.target.value })}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
                >
                  {COLOR_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={selectedRole.description}
                  onChange={(e) => setSelectedRole({ ...selectedRole, description: e.target.value })}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
                />
              </div>
            </div>

            {/* Granular Permission Checkbox Matrix */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-3 font-label">
                Module-by-Module Capability Matrix
              </span>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#F8FAFC] font-bold uppercase tracking-wider text-[10px] text-slate-600">
                      <th className="py-2.5 px-3 min-w-[160px]">Module</th>
                      <th className="py-2.5 px-2 text-center w-14">View</th>
                      <th className="py-2.5 px-2 text-center w-14">Create</th>
                      <th className="py-2.5 px-2 text-center w-14">Edit</th>
                      <th className="py-2.5 px-2 text-center w-14">Approve</th>
                      <th className="py-2.5 px-2 text-center w-14">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MODULE_NAMES.map((mod) => {
                      const currentCap = selectedRole.capabilities.find((c) => c.module === mod.id) || {
                        module: mod.id,
                        view: false,
                        create: false,
                        edit: false,
                        approve: false,
                        delete: false,
                      };

                      return (
                        <tr key={mod.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3">
                            <span className="font-heading font-bold text-slate-900 block">{mod.id}</span>
                            <span className="font-body text-[10px] text-slate-500 block line-clamp-1">{mod.desc}</span>
                          </td>
                          {(["view", "create", "edit", "approve", "delete"] as const).map((capKey) => (
                            <td key={capKey} className="py-2.5 px-2 text-center align-middle">
                              <input
                                type="checkbox"
                                checked={Boolean(currentCap[capKey])}
                                onChange={() => handleCapabilityToggle(mod.id, capKey)}
                                className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {status && (
              <div
                className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium border ${
                  status.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}
              >
                {status.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                )}
                <span>{status.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-[#F8FAFC] px-6 py-3">
          <div>
            {!selectedRole.isSystem && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Role
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-label text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-5 py-2 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Saving..." : "Save Role Matrix"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
