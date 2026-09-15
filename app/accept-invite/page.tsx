// Invitation-acceptance landing page — the onboarding surface for invited team members.
// Validates credentials, sets display name, contact phone, and activates account.

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { completeInvitationAcceptance } from "./actions";
import {
  Warehouse,
  User,
  Lock,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setPending(true);

    const result = await completeInvitationAcceptance({
      displayName,
      phone,
      newPassword,
      confirmPassword,
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/");
  }

  const passwordsMatch = Boolean(confirmPassword && newPassword === confirmPassword);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4 sm:p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-xl space-y-6">
        {/* Brand & Welcome Header */}
        <div className="flex flex-col items-center text-center space-y-2 border-b border-slate-100 pb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy text-white shadow-sm">
            <Warehouse className="h-6 w-6" />
          </div>
          <div className="space-y-1 pt-1">
            <span className="font-heading text-xs font-bold uppercase tracking-wider text-brand-navy">
              Dyna-Serv WIMS
            </span>
            <h1 className="font-heading text-xl font-bold text-slate-900">
              Welcome to the Warehouse Team
            </h1>
            <p className="font-body text-xs text-slate-500 max-w-sm">
              Complete your account setup to activate your floor scanning and operations access.
            </p>
          </div>
        </div>

        {/* Security & Access Banner */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900">
          <ShieldCheck className="h-4 w-4 text-brand-royal-blue shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-heading font-bold block">Pre-Assigned Role &amp; Access</span>
            <p className="font-body text-blue-700 text-[11px]">
              Your system capabilities and warehouse permissions were pre-configured by an administrator.
            </p>
          </div>
        </div>

        {/* Onboarding Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Section 1: Identity */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="accept-display-name"
                className="block font-label text-xs font-bold text-slate-700 mb-1"
              >
                Full Legal Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="accept-display-name"
                  data-testid="accept-display-name-input"
                  type="text"
                  required
                  placeholder="e.g. Maria Santos"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
                />
              </div>
              <p className="font-body text-[11px] text-slate-400 mt-1">
                Used for physical intake sign-offs, pick lists, and audit log stamps.
              </p>
            </div>

            <div>
              <label
                htmlFor="accept-phone"
                className="block font-label text-xs font-bold text-slate-700 mb-1"
              >
                Contact Number (Optional)
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="accept-phone"
                  type="tel"
                  placeholder="+63 9XX XXX XXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Security & Credentials */}
          <div className="space-y-4 pt-1 border-t border-slate-100">
            <div>
              <label
                htmlFor="accept-password"
                className="block font-label text-xs font-bold text-slate-700 mb-1"
              >
                Create Account Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="accept-password"
                  data-testid="accept-password-input"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="accept-confirm-password"
                className="block font-label text-xs font-bold text-slate-700 mb-1"
              >
                Confirm Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="accept-confirm-password"
                  data-testid="accept-confirm-password-input"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`h-10 w-full rounded-xl border bg-white pl-9 pr-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:ring-2 ${
                    passwordsMatch
                      ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-100"
                      : "border-slate-200 focus:border-brand-navy focus:ring-brand-navy/10"
                  }`}
                />
              </div>
              {passwordsMatch && (
                <p className="font-body text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Passwords match
                </p>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-rose-50 p-3.5 text-xs font-medium text-rose-800 border border-rose-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            data-testid="accept-invite-submit"
            disabled={pending || !displayName.trim() || !newPassword || !confirmPassword}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 transition-colors disabled:opacity-50"
          >
            {pending ? (
              "Activating Account..."
            ) : (
              <>
                <span>Complete Onboarding &amp; Enter WIMS</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-2 text-center">
          <p className="font-mono text-[11px] text-slate-400">
            Dyna-Serv WIMS • Floor-First Warehouse Management
          </p>
        </div>
      </div>
    </div>
  );
}
