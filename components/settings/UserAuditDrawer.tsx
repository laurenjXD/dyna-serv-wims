"use client";

import { useEffect, useState } from "react";
import {
  X,
  User,
  Shield,
  Smartphone,
  History,
  LogOut,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Wifi,
} from "lucide-react";
import type { TeamMember, UserAuditItem } from "@/app/(authenticated)/settings/team/actions";
import { getUserAuditTrail, revokeUserSession } from "@/app/(authenticated)/settings/team/actions";

interface UserAuditDrawerProps {
  user: TeamMember | null;
  onClose: () => void;
}

export function UserAuditDrawer({ user, onClose }: UserAuditDrawerProps) {
  const [auditItems, setAuditItems] = useState<UserAuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokedMessage, setRevokedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setRevokedMessage(null);
    getUserAuditTrail(user.id).then((res) => {
      setLoading(false);
      if (res.ok) {
        setAuditItems(res.data);
      }
    });
  }, [user]);

  if (!user) return null;

  async function handleRevoke() {
    if (!user) return;
    if (confirm(`Revoke all active BYOD device sessions for ${user.displayName}?`)) {
      setRevoking(true);
      await revokeUserSession(user.id);
      setRevoking(false);
      setRevokedMessage("Device session revoked successfully.");
    }
  }

  function handleExportCsv() {
    if (!user || auditItems.length === 0) return;
    const headers = ["Timestamp", "Action", "Entity Type", "Entity ID", "Device Context", "Details"];
    const rows = auditItems.map((item) => [
      `"${item.timestamp}"`,
      `"${item.action}"`,
      `"${item.entityType}"`,
      `"${item.entityId || ""}"`,
      `"${item.deviceContext}"`,
      `"${item.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `user_audit_${user.employeeId}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl border-l border-slate-200 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#F8FAFC] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white font-bold font-heading text-sm shadow-xs">
                {user.displayName.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-base font-bold text-slate-900">{user.displayName}</h3>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                    {user.employeeId}
                  </span>
                </div>
                <p className="font-body text-xs text-slate-500">{user.email || "No email registered"}</p>
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

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Active BYOD Session Card */}
            <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-heading text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-primary" />
                  Active BYOD Device Session
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {user.sessionStatus.toUpperCase()}
                </span>
              </div>

              <div className="grid gap-2 text-xs">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-500">Session UUID:</span>
                  <span className="font-bold text-brand-navy">{user.sessionUuid}</span>
                </div>
                <div className="flex justify-between font-body">
                  <span className="text-slate-500">Hardware / Client:</span>
                  <span className="font-semibold text-slate-800">{user.activeDevice}</span>
                </div>
                <div className="flex justify-between font-body">
                  <span className="text-slate-500">Connected Zone:</span>
                  <span className="font-semibold text-slate-800">Zone A Intake (Wi-Fi)</span>
                </div>
              </div>

              {revokedMessage && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{revokedMessage}</span>
                </div>
              )}

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-label text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors shadow-2xs"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {revoking ? "Revoking..." : "Revoke Device Session"}
                </button>
              </div>
            </div>

            {/* Unfiltered Chronological Activity & Audit Trail */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <History className="h-4 w-4 text-slate-700" />
                  Activity &amp; Audit Trail
                </h4>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-label text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  Export Log (CSV)
                </button>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading user audit history...</div>
              ) : auditItems.length === 0 ? (
                <div className="rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500">
                  No floor activities recorded for this user yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {auditItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-heading font-bold text-slate-900">{item.action}</span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="font-body text-xs text-slate-600">{item.details}</p>
                      <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-slate-400">
                        <Wifi className="h-3 w-3 text-slate-400" />
                        <span>{item.deviceContext}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 bg-[#F8FAFC] px-6 py-3 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-brand-navy px-4 py-2 font-label text-xs font-bold text-white shadow-xs hover:bg-brand-navy/90"
            >
              Close Drawer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
