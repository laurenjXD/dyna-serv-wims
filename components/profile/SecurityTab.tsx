// Security tab — <ChangePasswordForm>, <ActiveSessionsList>, MFA entry
// point.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.1, §4.4
// (MFA — "Supabase Auth owns MFA enrollment... The `21` Security tab
// provides the UI entry point that routes the user into Supabase Auth's MFA
// setup flow via `supabase.auth.mfa.*` client calls. `21` does not store
// MFA state or device records"), §4.5 (session display — read-only,
// sourced from Supabase Auth metadata, no extend/mint/revoke-on-behalf
// controls), and tasks.md Tasks 21.3/21.11/21.12.

"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { OwnProfile } from "@/app/(authenticated)/profile/actions";
import { changePassword } from "@/app/(authenticated)/profile/actions";
import { changePasswordSchema } from "@/lib/user-settings/schemas";
import { createClient } from "@/lib/supabase/client";

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
    // Runs through the server Supabase client (design.md §4.5 — never a
    // direct browser-side Supabase call for a credential mutation on this
    // surface).
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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="font-heading text-headline-md font-semibold text-on-surface">
        Change password
      </h2>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="new-password"
          className="font-label text-body-md uppercase tracking-wide text-on-surface"
        >
          New password
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
          className="min-h-14 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="confirm-password"
          className="font-label text-body-md uppercase tracking-wide text-on-surface"
        >
          Confirm new password
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
          className="min-h-14 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        />
      </div>

      {error && (
        <p role="alert" className="font-body text-body-md text-brand-red">
          {error}
        </p>
      )}
      {status === "saved" && (
        <p role="status" className="font-body text-body-md text-status-available">
          Password updated.
        </p>
      )}

      <button
        type="submit"
        disabled={status === "saving"}
        data-testid="save-password"
        className="flex min-h-14 w-full items-center justify-center rounded bg-brand-navy px-4 font-label text-body-md uppercase tracking-wide text-surface-white transition-transform duration-0 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {status === "saving" ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

interface MfaFactor {
  id: string;
  status: string;
}

// MFA is an interactive, stateful, multi-step exchange (enroll -> show QR ->
// verify code against the SAME enrollment session) — it runs client-side
// against the browser Supabase client, unlike ChangePasswordForm above.
// `21` never stores factor state itself (design.md §4.4); this component
// only calls through to `supabase.auth.mfa.*` and reflects its responses.
function MfaSection() {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  // KNOWN SEAM GAP (flag for integration-reviewer): whether an
  // administrator has configured MFA as required (design.md §4.4 — a
  // "policy managed in `04`/Supabase Auth project settings") is not
  // queryable from this client surface today. Defaulting to "not required"
  // (disable control shown) rather than guessing a stricter default; wire
  // the real policy source here once `04-services-and-infrastructure`
  // exposes it.
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
    <div className="flex flex-col gap-3 border-t border-outline-variant/30 pt-4">
      <h2 className="font-heading text-headline-md font-semibold text-on-surface">
        Two-factor authentication
      </h2>

      {factors.length > 0 && (
        <ul className="flex flex-col gap-2">
          {factors.map((factor) => (
            <li
              key={factor.id}
              className="flex items-center justify-between rounded border border-outline-variant/30 px-3 py-2"
            >
              <span className="font-body text-body-md text-on-surface">
                Authenticator app ({factor.status})
              </span>
              {!mfaRequiredByPolicy && (
                <button
                  type="button"
                  onClick={() => handleRemove(factor.id)}
                  // Destructive action -> status-held, not brand-red, per
                  // brand-design-system.md §9 ("Destructive: status-held
                  // solid") — brand-red is reserved for primary CTA/active
                  // nav, never a destructive/removal action.
                  className="flex min-h-14 items-center px-2 font-label text-body-md uppercase tracking-wide text-status-held active:opacity-70"
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
          // Solid, not outline — brand-design-system.md §9: floor screens
          // avoid outline-only buttons since they're harder to spot at
          // speed, and /profile defaults to floor per the 2026-08-08
          // amendment (design.md §1.1).
          className="flex min-h-14 w-full items-center justify-center rounded bg-brand-navy px-4 font-label text-body-md uppercase tracking-wide text-surface-white transition-transform duration-0 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {enrolling ? "Starting…" : "Set up two-factor authentication"}
        </button>
      )}

      {qrCode && (
        <form onSubmit={handleVerify} className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase
              returns an inline SVG data URI, not a static asset next/image
              can optimize. */}
          <img src={qrCode} alt="Scan with your authenticator app" className="h-40 w-40" />
          <label
            htmlFor="mfa-code"
            className="font-label text-body-md uppercase tracking-wide text-on-surface"
          >
            Enter the 6-digit code
          </label>
          <input
            id="mfa-code"
            data-testid="mfa-code-input"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-14 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-mono text-mono-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
          <button
            type="submit"
            data-testid="mfa-verify"
            className="flex min-h-14 w-full items-center justify-center rounded bg-brand-navy px-4 font-label text-body-md uppercase tracking-wide text-surface-white transition-transform duration-0 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Verify and enable
          </button>
        </form>
      )}

      {verified && (
        <p role="status" className="font-body text-body-md text-status-available">
          Two-factor authentication enabled.
        </p>
      )}
      {error && (
        <p role="alert" className="font-body text-body-md text-brand-red">
          {error}
        </p>
      )}
    </div>
  );
}

// KNOWN SEAM GAP (flag for integration-reviewer): design.md §4.5 allows a
// "read-only... active-sessions list from Supabase Auth metadata" —
// supabase-js's browser/server client SDK exposes the CURRENT session's
// metadata (last sign-in time) but has no public method to list every
// active session/device for a user (that requires an Admin API surface this
// repo has not wired for self-service use). This renders only the current
// session's last-sign-in time rather than fabricating a multi-device list.
function ActiveSessionsList({ profile }: { profile: OwnProfile }) {
  return (
    <div className="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
      <h2 className="font-heading text-headline-md font-semibold text-on-surface">
        Active session
      </h2>
      <div className="rounded border border-outline-variant/30 px-3 py-2">
        <p className="font-body text-body-md text-on-surface">This device — current session</p>
        <p className="font-body text-body-md text-on-surface">
          Last sign-in:{" "}
          {profile.lastSignInAt ? new Date(profile.lastSignInAt).toLocaleString() : "Unknown"}
        </p>
      </div>
    </div>
  );
}

export function SecurityTab({ profile }: { profile: OwnProfile }) {
  return (
    <div className="flex flex-col gap-6">
      <ChangePasswordForm />
      <MfaSection />
      <ActiveSessionsList profile={profile} />
    </div>
  );
}
