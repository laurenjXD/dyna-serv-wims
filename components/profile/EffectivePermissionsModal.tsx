"use client";

import { X, ShieldCheck, Check, Lock } from "lucide-react";
import type { PermissionCapability } from "@/app/(authenticated)/profile/actions";

interface EffectivePermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  permissions: PermissionCapability[];
  userRoles: Array<{ key: string; name: string; color?: string }>;
}

export function EffectivePermissionsModal({
  isOpen,
  onClose,
  permissions,
  userRoles,
}: EffectivePermissionsModalProps) {
  if (!isOpen) return null;

  // Group permissions by module
  const grouped = permissions.reduce<Record<string, PermissionCapability[]>>((acc, perm) => {
    acc[perm.module] = acc[perm.module] || [];
    acc[perm.module].push(perm);
    return acc;
  }, {});

  const modules = Object.keys(grouped);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#F8FAFC] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-slate-900">
                My Effective Platform Permissions
              </h3>
              <p className="font-body text-xs text-slate-500">
                Authorized capabilities calculated additively from your assigned roles.
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

        {/* Body */}
        <div className="max-h-[65vh] overflow-y-auto p-6 space-y-6">
          {/* Active Roles Summary */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2 font-label">
              Active Assigned Roles
            </span>
            <div className="flex flex-wrap gap-2">
              {userRoles.map((role) => (
                <span
                  key={role.key}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-label text-xs font-bold border ${role.color || "bg-slate-100 text-slate-800 border-slate-200"}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {role.name}
                </span>
              ))}
            </div>
          </div>

          {/* Module-by-Module Capabilities */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-3 font-label">
              Authorized Capabilities Matrix ({permissions.length} total grants)
            </span>

            {modules.length === 0 ? (
              <div className="rounded-xl border border-slate-200 p-6 text-center">
                <Lock className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                <p className="font-heading text-sm font-bold text-slate-700">Standard Floor View Access</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  You have essential floor scanning, receiving intake, and picking permissions.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {modules.map((modName) => (
                  <div
                    key={modName}
                    className="rounded-xl border border-slate-200/80 bg-[#F8FAFC]/50 p-4"
                  >
                    <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-brand-navy mb-2 flex items-center justify-between">
                      <span>{modName}</span>
                      <span className="text-[11px] font-normal text-slate-500 lowercase">
                        {grouped[modName].length} capabilities
                      </span>
                    </h4>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {grouped[modName].map((perm, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 rounded-lg bg-white p-2 border border-slate-100 text-xs shadow-2xs"
                        >
                          <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                          <div>
                            <span className="font-mono font-bold text-slate-800 uppercase">
                              {perm.action}
                            </span>
                            <span className="text-slate-400 mx-1">·</span>
                            <span className="font-mono text-slate-600">{perm.resource}</span>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {perm.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-[#F8FAFC] px-6 py-3">
          <span className="text-[11px] text-slate-400 font-body">
            Permissions are managed by your System Administrator.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-brand-navy px-4 py-2 font-label text-xs font-bold text-white shadow-xs hover:bg-brand-navy/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
