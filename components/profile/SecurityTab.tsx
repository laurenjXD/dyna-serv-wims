"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { OwnProfile } from "@/app/(authenticated)/profile/actions";
import { changePassword } from "@/app/(authenticated)/profile/actions";
import { changePasswordSchema } from "@/lib/user-settings/schemas";
import { createClient } from "@/lib/supabase/client";
import { KeyRound, ShieldCheck, Smartphone, CheckCircle2, AlertCircle, QrCode, Lock, Check } from "lucide-react";

function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = changePasswordSchema.safeParse({ newPassword, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid password");
      return;
    }

    setStatus("saving");
    const result = await changePassword(parsed.data);
    if (!result.ok) {
      setError(result.error);
      setStatus("idle");
      return;
    }
    setStatus("saved");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <h3 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-navy" />
          Change Password
        </h3>
        <p className="mt-0.5 font-body text-xs text-slate-500">
          Must be at least 8 characters. Ensure passwords contain mixed casing and numbers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="new-password"
            className="block font-label text-xs font-bold text-slate-700 mb-1"
          >
            New Password
          </label>
          <input
            id="new-password"
            data-testid="new-password-input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setStatus("idle");
            }}
            placeholder="Enter new password"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
          />
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="block font-label text-xs font-bold text-slate-700 mb-1"
          >
            Confirm New Password
          </label>
          <input
            id="confirm-password"
            data-testid="confirm-password-input"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setStatus("idle");
            }}
            placeholder="Confirm new password"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      {status === "saved" && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Password updated successfully.</span>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={status === "saving"}
          data-testid="save-password"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 transition-colors disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" />
          {status === "saving" ? "Updating..." : "Update Password"}
        </button>
      </div>
    </form>
  );
}

interface MfaFactor {
  id: string;
  status: string;
}

function MfaSection() {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const mfaRequiredByPolicy = false;

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (data) {
        setFactors(data.totp.map((f) => ({ id: f.id, status: f.status })));
      }
    });
  }, [verified]);

  async function handleEnroll() {
    setError(null);
    setEnrolling(true);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });
    setEnrolling(false);
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
  }

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setVerified(true);
    setQrCode(null);
    setFactorId(null);
    setCode("");
  }

  async function handleRemove(id: string) {
    setError(null);
    const supabase = createClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (unenrollError) {
      setError(unenrollError.message);
      return;
    }
    setFactors((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="border-t border-slate-100 pt-6 space-y-4">
      <div>
        <h3 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Two-Factor Authentication (2FA)
        </h3>
        <p className="mt-0.5 font-body text-xs text-slate-500">
          Enhance account protection with time-based one-time passwords (TOTP Authenticator app).
        </p>
      </div>

      {factors.length > 0 && (
        <ul className="space-y-2">
          {factors.map((factor) => (
            <li
              key={factor.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span className="font-heading font-bold text-slate-900">
                  Authenticator App
                </span>
                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
                  {factor.status.toUpperCase()}
                </span>
              </div>
              {!mfaRequiredByPolicy && (
                <button
                  type="button"
                  onClick={() => handleRemove(factor.id)}
                  className="rounded-lg px-2.5 py-1 font-label text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {factors.length === 0 && !qrCode && (
        <button
          type="button"
          onClick={handleEnroll}
          disabled={enrolling}
          data-testid="mfa-enroll"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 font-label text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-60"
        >
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          {enrolling ? "Starting..." : "Set Up Two-Factor Authentication"}
        </button>
      )}

      {qrCode && (
        <form onSubmit={handleVerify} className="space-y-4 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 max-w-md">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 font-heading">
            <QrCode className="h-4 w-4 text-brand-navy" />
            Scan QR Code in Authenticator App
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-200 inline-block shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="Scan with your authenticator app" className="h-36 w-36" />
          </div>
          <div>
            <label
              htmlFor="mfa-code"
              className="block font-label text-xs font-bold text-slate-700 mb-1"
            >
              Enter the 6-Digit Code
            </label>
            <input
              id="mfa-code"
              data-testid="mfa-code-input"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm tracking-widest text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
          </div>
          <button
            type="submit"
            data-testid="mfa-verify"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 transition-colors"
          >
            <Check className="h-4 w-4" />
            Verify and Enable
          </button>
        </form>
      )}

      {verified && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Two-factor authentication enabled successfully.</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function ActiveSessionsList({ profile }: { profile: OwnProfile }) {
  return (
    <div className="border-t border-slate-100 pt-6 space-y-3">
      <div>
        <h3 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          Active Device Session
        </h3>
        <p className="mt-0.5 font-body text-xs text-slate-500">
          Current authenticated client and floor hardware binding status.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 text-xs">
        <div className="space-y-0.5">
          <span className="font-heading font-bold text-slate-900 block">
            This Device — Current Session
          </span>
          <p className="font-mono text-[11px] text-slate-500">
            Last sign-in: {profile.lastSignInAt ? new Date(profile.lastSignInAt).toLocaleString() : "Active Now"}
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          CONNECTED
        </span>
      </div>
    </div>
  );
}

export function SecurityTab({ profile }: { profile: OwnProfile }) {
  return (
    <div className="space-y-6">
      <ChangePasswordForm />
      <MfaSection />
      <ActiveSessionsList profile={profile} />
    </div>
  );
}
