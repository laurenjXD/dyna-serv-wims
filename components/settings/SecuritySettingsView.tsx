"use client";

import { useState } from "react";
import {
  ShieldAlert,
  Wifi,
  KeyRound,
  QrCode,
  Smartphone,
  History,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  Search,
  Sliders,
  Trash2,
  Eye,
  Lock,
  Flame,
  Radio,
} from "lucide-react";
import type {
  SecuritySettingsData,
  ActiveSessionItem,
  SystemAuditEvent,
} from "@/app/(authenticated)/settings/security/actions";
import {
  saveSecuritySettings,
  terminateAllMobileSessions,
} from "@/app/(authenticated)/settings/security/actions";
import { AuditDiffModal } from "./AuditDiffModal";

export function SecuritySettingsView({
  initialSettings,
  initialSessions,
  initialEvents,
}: {
  initialSettings: SecuritySettingsData;
  initialSessions: ActiveSessionItem[];
  initialEvents: SystemAuditEvent[];
}) {
  const [settings, setSettings] = useState<SecuritySettingsData>(initialSettings);
  const [sessions, setSessions] = useState<ActiveSessionItem[]>(initialSessions);
  const [events] = useState<SystemAuditEvent[]>(initialEvents);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [diffModalEvent, setDiffModalEvent] = useState<SystemAuditEvent | null>(null);
  const [newIpInput, setNewIpInput] = useState("");
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);
  const [killSwitchMessage, setKillSwitchMessage] = useState<string | null>(null);

  // Audit filter state
  const [auditSearch, setAuditSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);
    const res = await saveSecuritySettings(settings);
    setIsSaving(false);
    if (res.ok) {
      setSaveStatus({ type: "success", message: "Security, authentication, and BYOD policies saved successfully." });
    } else {
      setSaveStatus({ type: "error", message: res.error || "Failed to save security policies." });
    }
  }

  function handleAddIpRange() {
    if (!newIpInput.trim()) return;
    if (settings.network.allowedIpRanges.includes(newIpInput.trim())) return;
    setSettings({
      ...settings,
      network: {
        ...settings.network,
        allowedIpRanges: [...settings.network.allowedIpRanges, newIpInput.trim()],
      },
    });
    setNewIpInput("");
  }

  function handleRemoveIpRange(ip: string) {
    setSettings({
      ...settings,
      network: {
        ...settings.network,
        allowedIpRanges: settings.network.allowedIpRanges.filter((item) => item !== ip),
      },
    });
  }

  async function handleEmergencyKillSwitch() {
    if (confirm("EMERGENCY ACTION: Immediately terminate ALL connected BYOD mobile web sessions across the warehouse floor?")) {
      setKillSwitchLoading(true);
      setKillSwitchMessage(null);
      const res = await terminateAllMobileSessions();
      setKillSwitchLoading(false);
      if (res.ok) {
        setKillSwitchMessage(`Emergency termination complete. ${res.count} active mobile session(s) disconnected.`);
        setSessions((prev) => prev.filter((s) => !s.deviceAlias.toLowerCase().includes("mobile")));
      }
    }
  }

  const filteredEvents = events.filter((evt) => {
    if (moduleFilter !== "all" && evt.module !== moduleFilter) return false;
    if (severityFilter !== "all" && evt.severity !== severityFilter) return false;
    if (!auditSearch) return true;
    const query = auditSearch.toLowerCase();
    return (
      evt.action.toLowerCase().includes(query) ||
      evt.actor.toLowerCase().includes(query) ||
      evt.targetEntity.toLowerCase().includes(query) ||
      evt.deviceContext.toLowerCase().includes(query)
    );
  });

  function handleExportAuditCsv() {
    if (filteredEvents.length === 0) return;
    const headers = ["Timestamp", "Actor", "Action", "Target", "Module", "Severity", "Device Context", "Details"];
    const rows = filteredEvents.map((e) => [
      `"${e.timestamp}"`,
      `"${e.actor}"`,
      `"${e.action}"`,
      `"${e.targetEntity}"`,
      `"${e.module}"`,
      `"${e.severity}"`,
      `"${e.deviceContext}"`,
      `"${e.rawDetails.replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `system_audit_log_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* ── 1. Network-Gated BYOD Access ──────────────────────── */}
      <form onSubmit={handleSaveSettings} className="space-y-8">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-slate-900">
                Network-Gated BYOD Access (IP Whitelisting)
              </h2>
              <p className="font-body text-xs text-slate-500">
                Restrict warehouse floor scanning and stock mutations strictly to the internal Wi-Fi network.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-[#F8FAFC] cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={settings.network.wifiEnforcementEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    network: {
                      ...settings.network,
                      wifiEnforcementEnabled: e.target.checked,
                    },
                  })
                }
                className="h-4 w-4 mt-0.5 rounded text-brand-navy focus:ring-brand-navy"
              />
              <div>
                <span className="font-heading text-xs font-bold text-slate-900 block">
                  Enforce Warehouse Local Wi-Fi Network Restriction
                </span>
                <p className="text-xs text-slate-500 mt-0.5 font-body">
                  When enabled, floor operators are blocked from receiving intake or picking stock while connected via external cellular data off-premises.
                </p>
              </div>
            </label>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2 font-label">
                Whitelisted Warehouse Subnets &amp; IP Ranges (CIDR)
              </span>
              <div className="flex flex-wrap gap-2 mb-3">
                {settings.network.allowedIpRanges.map((ip) => (
                  <span
                    key={ip}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1 font-mono text-xs font-semibold text-slate-700 border border-slate-200"
                  >
                    <span>{ip}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIpRange(ip)}
                      className="text-slate-400 hover:text-rose-600 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  placeholder="e.g. 192.168.20.0/24"
                  value={newIpInput}
                  onChange={(e) => setNewIpInput(e.target.value)}
                  className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
                />
                <button
                  type="button"
                  onClick={handleAddIpRange}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 font-label text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  Add Subnet
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. Authentication & Access Rules ──────────────────── */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-royal-blue text-white shadow-xs">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-slate-900">
                Authentication &amp; Access Rules
              </h2>
              <p className="font-body text-xs text-slate-500">
                Password governance policies, Two-Factor Authentication (2FA), and Shift QR Check-In bindings.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                Minimum Password Length
              </label>
              <input
                type="number"
                min="8"
                max="32"
                value={settings.authRules.passwordMinLength}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    authRules: {
                      ...settings.authRules,
                      passwordMinLength: parseInt(e.target.value, 10) || 8,
                    },
                  })
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
              />
            </div>

            <div>
              <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                Password Expiry Interval
              </label>
              <select
                value={settings.authRules.passwordExpiryDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    authRules: {
                      ...settings.authRules,
                      passwordExpiryDays: parseInt(e.target.value, 10),
                    },
                  })
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
              >
                <option value={30}>Every 30 Days</option>
                <option value={60}>Every 60 Days</option>
                <option value={90}>Every 90 Days (Recommended)</option>
                <option value={180}>Every 180 Days</option>
                <option value={0}>Never Expire</option>
              </select>
            </div>

            <div>
              <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                Two-Factor Authentication (2FA)
              </label>
              <select
                value={settings.authRules.mfaPolicy}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    authRules: {
                      ...settings.authRules,
                      mfaPolicy: e.target.value as "optional" | "enforced" | "role_gated",
                    },
                  })
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
              >
                <option value="role_gated">Role-Gated (Admins &amp; Supervisors)</option>
                <option value="enforced">Enforced for All Users</option>
                <option value="optional">Optional / Self-Service</option>
              </select>
            </div>

            <div className="sm:col-span-3 space-y-2 pt-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.authRules.requireSpecialChars}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      authRules: {
                        ...settings.authRules,
                        requireSpecialChars: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
                />
                <span className="font-body text-xs font-semibold text-slate-800">
                  Require at least one uppercase letter, number, and special character in passwords
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.authRules.shiftQrLoginEnabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      authRules: {
                        ...settings.authRules,
                        shiftQrLoginEnabled: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
                />
                <span className="font-body text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <QrCode className="h-3.5 w-3.5 text-emerald-600" />
                  Enable Shift QR Check-In / Operator badge barcode scan login for floor devices
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* ── 3. BYOD Session Management & Emergency Kill-Switch ── */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-700 text-white shadow-xs">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-heading text-base font-bold text-slate-900">
                  BYOD Session Management &amp; Inspector
                </h2>
                <p className="font-body text-xs text-slate-500">
                  Idle timeout boundaries, active session inspection, and emergency floor disconnection.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleEmergencyKillSwitch}
              disabled={killSwitchLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 font-label text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-100 transition-colors"
            >
              <Flame className="h-4 w-4 text-rose-600" />
              {killSwitchLoading ? "Terminating..." : "Force Terminate All Mobile Sessions"}
            </button>
          </div>

          {killSwitchMessage && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{killSwitchMessage}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                Mobile Web Floor Idle Timeout
              </label>
              <select
                value={settings.sessionConfig.mobileIdleTimeoutMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sessionConfig: {
                      ...settings.sessionConfig,
                      mobileIdleTimeoutMinutes: parseInt(e.target.value, 10),
                    },
                  })
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
              >
                <option value={10}>10 Minutes of Inactivity</option>
                <option value={15}>15 Minutes of Inactivity (Recommended for Floor)</option>
                <option value={30}>30 Minutes of Inactivity</option>
              </select>
            </div>

            <div>
              <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                Desktop Office Idle Timeout
              </label>
              <select
                value={settings.sessionConfig.desktopIdleTimeoutMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sessionConfig: {
                      ...settings.sessionConfig,
                      desktopIdleTimeoutMinutes: parseInt(e.target.value, 10),
                    },
                  })
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
              >
                <option value={30}>30 Minutes of Inactivity</option>
                <option value={60}>60 Minutes of Inactivity (Standard Office)</option>
                <option value={120}>120 Minutes of Inactivity</option>
              </select>
            </div>
          </div>

          {/* Active Session Inspector Grid */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2 font-label">
              Active Connected BYOD Sessions ({sessions.length} live devices)
            </span>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-2.5 px-3">Operator</th>
                    <th className="py-2.5 px-3">Session UUID</th>
                    <th className="py-2.5 px-3">Device / Client</th>
                    <th className="py-2.5 px-3">IP &amp; Zone</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <span className="font-heading font-bold text-slate-900 block">{s.userName}</span>
                        <span className="font-mono text-[10px] text-slate-500">{s.employeeId}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-brand-navy">
                        {s.sessionUuid}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-body text-slate-700 block">{s.deviceAlias}</span>
                        <span className="font-mono text-[10px] text-slate-400 block truncate max-w-[180px]" title={s.browserUserAgent}>
                          {s.browserUserAgent}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-slate-700 block">{s.ipAddress}</span>
                        <span className="font-body text-[10px] text-slate-500 block">{s.connectedZone}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold border ${
                            s.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${s.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {saveStatus && (
          <div
            className={`flex items-center gap-2 rounded-xl p-4 text-xs font-medium border ${
              saveStatus.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}
          >
            {saveStatus.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{saveStatus.message}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-navy px-6 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Security & Access Rules"}
          </button>
        </div>
      </form>

      {/* ── 4. Whole-System Audit Log & Event Ledger ──────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-heading text-lg font-bold text-slate-900">
                Whole-System Audit Log &amp; Event Ledger
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                {filteredEvents.length} events
              </span>
            </div>
            <p className="mt-0.5 font-body text-xs text-slate-500">
              Centralized, immutable ledger tracking floor mutations, financial events, RBAC modifications, and BYOD security events.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-label text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export Full Audit Log (CSV)
          </button>
        </div>

        {/* Audit Search and Multi-Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Actor, Action, Target, or Device Context..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            >
              <option value="all">All Event Modules</option>
              <option value="Floor & Stock">Floor &amp; Stock</option>
              <option value="Financial & Billing">Financial &amp; Billing</option>
              <option value="RBAC & Admin">RBAC &amp; Admin</option>
              <option value="Security & BYOD">Security &amp; BYOD</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            >
              <option value="all">All Severity Levels</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical / Security</option>
            </select>
          </div>
        </div>

        {/* System Audit Data Grid */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-3 w-32">Timestamp</th>
                <th className="py-3 px-3 min-w-[150px]">Actor / Initiator</th>
                <th className="py-3 px-3 min-w-[180px]">Action &amp; Target</th>
                <th className="py-3 px-3 w-32">Module</th>
                <th className="py-3 px-3 min-w-[180px]">Device Context</th>
                <th className="py-3 px-3 text-center w-24">Delta Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No system audit events match your query.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500 align-top">
                      {new Date(evt.timestamp).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-3 align-top">
                      <span className="font-heading font-bold text-slate-900 block">{evt.actor}</span>
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-heading font-semibold text-slate-800">{evt.action}</span>
                        <span className="font-mono text-[10px] font-bold text-primary bg-blue-50 px-1 py-0.2 rounded border border-blue-100">
                          {evt.targetEntity}
                        </span>
                      </div>
                      <p className="font-body text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {evt.rawDetails}
                      </p>
                    </td>
                    <td className="py-3 px-3 align-top">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-[10px] font-bold border ${
                          evt.severity === "critical"
                            ? "bg-rose-50 text-rose-800 border-rose-200"
                            : evt.severity === "warning"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {evt.module}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500 align-top truncate max-w-[200px]" title={evt.deviceContext}>
                      {evt.deviceContext}
                    </td>
                    <td className="py-3 px-3 align-top text-center">
                      <button
                        type="button"
                        onClick={() => setDiffModalEvent(evt)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-label text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                      >
                        <Eye className="h-3 w-3 text-slate-500" />
                        View Diff
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* JSON / Delta Diff Modal */}
      <AuditDiffModal
        event={diffModalEvent}
        onClose={() => setDiffModalEvent(null)}
      />
    </div>
  );
}
