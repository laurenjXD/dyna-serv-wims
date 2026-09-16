// Login page — office surface (not floor).
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §3 (unauthenticated entry:
//   single sign-in/recovery boundary from 04-services-and-infrastructure)
//   and §7 (server-validated session; never trust client-supplied identity).
// - specs/00-steering/brand-design-system.md §9 (office button: 44px height,
//   brand-navy primary button; form inputs: brand-navy focus ring).
//
// Uses createClient() from @/lib/supabase/client (the SSR browser client)
// for the auth call only — the server session resolver remains authoritative
// for the protected shell's session state.

"use client";

import { useState, useEffect, type FormEvent } from "react";
import { signInAction } from "./actions";
import { createClient } from "@/lib/supabase/client";

function ArchEyeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 13C5 6.5 19 6.5 21 13" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

function ArchEyeOffIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 13C5 6.5 19 6.5 21 13" />
      <circle cx="12" cy="13.5" r="3.5" />
      <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2" />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Detect invite link tokens, hash parameters, or invited user sessions
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check URL query parameters (e.g. ?code=... or ?error=...)
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    const errParam = searchParams.get("error_description") || searchParams.get("error");
    if (errParam) {
      setError(errParam);
    }

    if (code) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}&next=/accept-invite`);
      return;
    }

    // 2. Check URL hash parameters (e.g. #access_token=...&type=invite)
    const hash = window.location.hash;
    if (hash && (hash.includes("type=invite") || hash.includes("type=recovery") || hash.includes("access_token"))) {
      window.location.replace(`/accept-invite${hash}`);
      return;
    }

    // 3. Check if active session is already present and in 'invited' state
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          supabase
            .from("user_profiles")
            .select("status")
            .eq("id", session.user.id)
            .maybeSingle()
            .then(({ data: profile }) => {
              if (profile?.status === "invited") {
                window.location.replace("/accept-invite");
              }
            });
        }
      });
    } catch {
      // ignore
    }
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        signInAction({ email, password }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Sign-in timed out")), 20_000);
        }),
      ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });

      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return;
      }

      // Go directly to the authenticated dashboard. Keep pending true so
      // button shows feedback while the browser executes the navigation.
      window.location.replace("/dashboard");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-light-grey p-4">
      <div className="w-full max-w-sm rounded bg-surface-white p-8 shadow-elevation-2">
        {/* Brand word-mark */}
        <div className="mb-8 text-center">
          <span className="font-label text-headline-md font-semibold text-brand-navy">
            Dyna-Serv WIMS
          </span>
        </div>

        <h1 className="mb-6 font-heading text-headline-md font-semibold text-brand-navy">
          Sign in
        </h1>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="login-email"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="login-password"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 pr-11 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-on-surface/60 hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {showPassword ? <ArchEyeOffIcon size={18} /> : <ArchEyeIcon size={18} />}
              </button>
            </div>
          </div>

          {/* Inline error — shown only when auth fails. */}
          {error && (
            <p
              role="alert"
              className="font-body text-body-md text-status-held"
            >
              {error}
            </p>
          )}

          {/* Office primary button: brand-navy solid, 44px height min,
              Epilogue SemiBold label per brand-design-system §9. */}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded bg-brand-navy px-4 font-label text-label uppercase tracking-wide text-surface-white hover:bg-brand-royal-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
