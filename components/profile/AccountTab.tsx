"use client";

import { useState } from "react";
import {
  Camera,
  Shield,
  Smartphone,
  QrCode,
  LogOut,
  History,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Upload,
  User,
  BadgeAlert,
  Clock,
  MapPin,
  Wifi,
} from "lucide-react";
import type { OwnProfile } from "@/app/(authenticated)/profile/actions";
import { updateProfileDetails, disconnectCurrentDevice } from "@/app/(authenticated)/profile/actions";
import { EffectivePermissionsModal } from "./EffectivePermissionsModal";

export function AccountTab({ profile }: { profile: OwnProfile }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatarUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);

    const res = await updateProfileDetails({
      displayName,
      phone,
      employeeId: profile.employeeId,
      avatarUrl: avatarPreview || undefined,
    });

    setIsSaving(false);
    if (res.ok) {
      setSaveStatus({ type: "success", message: "Profile details updated successfully." });
    } else {
      setSaveStatus({ type: "error", message: res.error || "Failed to update profile." });
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleDisconnect() {
    if (confirm("Disconnect this BYOD device and log out of the active shift session?")) {
      setIsDisconnecting(true);
      await disconnectCurrentDevice();
      window.location.href = "/login";
    }
  }

  return (
    <div className="space-y-8">
      {/* ── 1. Personal Identity & Credentials ─────────────────── */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-slate-100">
          {/* Avatar Upload / Capture */}
          <div className="relative group shrink-0">
            <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-100 text-slate-700 shadow-sm">
              {avatarPreview ? (
                <img src={avatarPreview} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="font-heading text-2xl font-bold text-brand-navy">
                  {displayName.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <label className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-brand-navy text-white shadow-md hover:bg-brand-navy/90 transition-colors">
              <Camera className="h-4 w-4" />
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only"
                onChange={handleAvatarChange}
              />
            </label>
          </div>

          {/* Quick Header Info */}
          <div className="space-y-1 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
              <h3 className="font-heading text-lg font-bold text-slate-900">{profile.displayName}</h3>
              <span className="rounded-md bg-brand-navy/10 px-2 py-0.5 font-mono text-xs font-bold text-brand-navy border border-brand-navy/20">
                {profile.employeeId}
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-label text-[11px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active Badge
              </span>
            </div>
            <p className="font-body text-xs text-slate-500">{profile.email || "No email registered"}</p>
            <p className="font-body text-xs text-slate-400">
              Avatar and ID badge are synchronized across floor scanning stations.
            </p>
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="account-display-name" className="block font-label text-xs font-bold text-slate-700 mb-1">
              Full Legal Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="account-display-name"
              type="text"
              required
              data-testid="display-name-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            />
          </div>

          <div>
            <label htmlFor="account-employee-id" className="block font-label text-xs font-bold text-slate-700 mb-1">
              Employee ID Badge (Read-Only)
            </label>
            <input
              id="account-employee-id"
              type="text"
              readOnly
              disabled
              value={profile.employeeId}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs font-semibold text-slate-600 shadow-2xs cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="account-email" className="block font-label text-xs font-bold text-slate-700 mb-1">
              Email
            </label>
            <input
              id="account-email"
              aria-label="Email"
              type="email"
              readOnly
              disabled
              value={profile.email ?? "—"}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-body text-xs text-slate-600 shadow-2xs cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="account-contact" className="block font-label text-xs font-bold text-slate-700 mb-1">
              Contact number
            </label>
            <input
              id="account-contact"
              aria-label="Contact number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63 9XX XXX XXXX"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            />
          </div>
        </div>

        {saveStatus && (
          <div
            role={saveStatus.type === "success" ? "status" : "alert"}
            className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium border ${
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
            data-testid="save-display-name"
            disabled={isSaving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Identity Changes"}
          </button>
        </div>
      </form>

      {/* ── 2. Assigned System Roles & Effective Permissions ────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
          <div>
            <h4 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-brand-navy" />
              Assigned Dynamic Roles &amp; Badges
            </h4>
            <p className="mt-0.5 font-body text-xs text-slate-500">
              Active roles determine what warehouse operations and financial tiers you can access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPermissionsModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-label text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            View Effective Permissions
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {profile.roles.map((role) => (
            <span
              key={role.key}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 font-label text-xs font-bold border shadow-2xs ${role.color || "bg-white text-slate-800 border-slate-200"}`}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              {role.name}
            </span>
          ))}
        </div>
      </section>

      {/* ── 3. BYOD Device & Active Session Card ───────────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h4 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              BYOD Device &amp; Active Shift Session
            </h4>
            <p className="mt-0.5 font-body text-xs text-slate-500">
              Hardware device fingerprinting and floor shift bindings for physical scan attribution.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 font-label text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors shadow-2xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isDisconnecting ? "Disconnecting..." : "Disconnect Device"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-100 bg-[#F8FAFC] p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
              Session Device Alias
            </span>
            <p className="font-heading font-semibold text-slate-800 flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-slate-500" />
              {profile.session.deviceAlias}
            </p>
            <p className="font-mono text-[11px] text-slate-400 truncate" title={profile.session.browserUserAgent}>
              {profile.session.browserUserAgent}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-[#F8FAFC] p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
              Ephemeral Session UUID
            </span>
            <p className="font-mono font-bold text-brand-navy text-xs">
              {profile.session.sessionId}
            </p>
            <p className="font-body text-[11px] text-slate-500 flex items-center gap-1">
              <Wifi className="h-3 w-3 text-emerald-600" />
              {profile.session.ipAddress}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-[#F8FAFC] p-3 space-y-1 sm:col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
              Current Shift &amp; Zone Binding
            </span>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-emerald-600" />
                <span className="font-heading font-bold text-slate-800">
                  {profile.session.shiftBinding}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                Logged in today at {profile.session.loginTime}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. My Personal Activity Log (Self-Service Audit) ────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h4 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-700" />
              My Personal Activity Log (Self-Service Audit)
            </h4>
            <p className="mt-0.5 font-body text-xs text-slate-500">
              Recent physical floor scans, intakes, picks, and system actions bound to your account.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">
            {profile.recentActivity.length} recent
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {profile.recentActivity.map((act) => (
            <div key={act.id} className="py-3 flex items-start justify-between gap-3 text-xs first:pt-0 last:pb-0">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold text-slate-900">
                    {act.action}
                  </span>
                  {act.entityId && (
                    <span className="font-mono text-[10px] font-bold text-primary bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                      {act.entityId}
                    </span>
                  )}
                </div>
                <p className="font-body text-slate-600 text-[11px] line-clamp-1">
                  {act.details}
                </p>
              </div>
              <span className="font-mono text-[10px] text-slate-400 shrink-0 mt-0.5">
                {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Effective Permissions Dialog */}
      <EffectivePermissionsModal
        isOpen={permissionsModalOpen}
        onClose={() => setPermissionsModalOpen(false)}
        permissions={profile.effectivePermissions}
        userRoles={profile.roles}
      />
    </div>
  );
}
