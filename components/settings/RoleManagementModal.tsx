"use client";

import { useState, useEffect } from "react";
import {
  X,
  Sliders,
  Info,
} from "lucide-react";
import type { DynamicRole } from "@/app/(authenticated)/settings/team/actions";

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
}

export function RoleManagementModal({
  isOpen,
  onClose,
  roles,
}: RoleManagementModalProps) {
  const [selectedRole, setSelectedRole] = useState<DynamicRole | null>(null);

  const activeRole = selectedRole ?? roles[0] ?? null;

  useEffect(() => {
    if (!selectedRole && roles.length > 0) {
      setSelectedRole(roles[0]);
    }
  }, [roles, selectedRole]);

  if (!isOpen || !activeRole) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-capability-reference-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#F8FAFC] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 id="role-capability-reference-title" className="font-heading text-base font-bold text-slate-900">
                Approved Role Capability Reference
              </h3>
              <p className="font-body text-xs text-slate-500">
                Review the approved capability reference before assigning a role.
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
              <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[9px] font-bold uppercase text-slate-500">
                System roles
              </span>
            </div>

            <div className="space-y-1.5">
              {roles.map((r) => {
                const isSelected = activeRole.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedRole(r);
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
                  value={activeRole.name}
                  readOnly
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-body text-xs text-slate-900 shadow-2xs outline-none"
                />
              </div>

              <div>
                <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                  Badge Color Style
                </label>
                <select
                  value={activeRole.color}
                  disabled
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-body text-xs text-slate-900 shadow-2xs outline-none disabled:opacity-100"
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
                  value={activeRole.description}
                  readOnly
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-body text-xs text-slate-900 shadow-2xs outline-none"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
              <p>
                Capability grants are managed by the approved RBAC migrations and are read-only here.
                Use <strong>Invite Operator</strong> to assign one of these roles to a new user.
              </p>
            </div>

            {/* Approved capability reference — intentionally read-only in v1. */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-3 font-label">
                Approved capability reference
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
                      const currentCap = activeRole.capabilities.find((c) => c.module === mod.id) || {
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
                                readOnly
                                disabled
                                aria-label={`${mod.id} ${capKey}`}
                                className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy disabled:opacity-100"
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

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-[#F8FAFC] px-6 py-3">
          <p className="font-body text-[11px] text-slate-500">
            Role definitions are versioned with the RBAC schema.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-label text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
