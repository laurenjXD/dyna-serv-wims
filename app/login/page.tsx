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
import Image from "next/image";
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
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Detect invite link tokens, hash parameters, or invited user sessions
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check URL query parameters (e.g. ?code=... or ?error=...)
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("activated") === "1") {
      setSuccess("Your account was created successfully. You can now sign in.");
    }
    const code = searchParams.get("code");
    const errParam = searchParams.get("error_description") || searchParams.get("error");
    if (errParam) {
      setError(errParam);
    }

    if (code) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}&next=/accept-invite`);
      return;
    }

    // Supabase can deliver invitations as a query-string OTP instead of a
    // PKCE code. Route it through the server callback so the invite session
    // is written to the SSR cookie before onboarding renders.
    const tokenHash = searchParams.get("token_hash");
    const tokenType = searchParams.get("type");
    if (tokenHash && tokenType === "invite") {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.search = searchParams.toString();
      callbackUrl.searchParams.set("next", "/accept-invite");
      window.location.replace(`${callbackUrl.pathname}${callbackUrl.search}`);
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
      window.location.replace("/");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3fb] px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        <section className="rounded-2xl border border-slate-200/80 bg-surface-white p-6 shadow-[0_18px_45px_rgba(15,39,104,0.12)] sm:p-9">
          <header className="mb-8 text-center">
            <Image
              src="/logo-hd.png"
              alt="Dyna-Serv"
              width={128}
              height={128}
              priority
              className="mx-auto mb-5 h-20 w-auto object-contain"
            />
            <p className="font-label text-xs font-semibold uppercase tracking-[0.18em] text-brand-navy/65">
              DYNA-SERV GLOBAL CORPORATION
            </p>
            <h1 className="mt-2 font-heading text-2xl font-semibold text-brand-navy">
              Welcome
            </h1>
            <p className="mt-2 font-body text-sm text-slate-500">
              Sign in to access warehouse operations.
            </p>
          </header>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 font-body text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 font-body text-sm text-emerald-700"
            >
              {success}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="login-email"
              className="font-label text-sm font-semibold text-slate-700"
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
              aria-invalid={Boolean(error) || undefined}
              className="h-12 rounded-lg border border-slate-300 bg-surface-white px-3.5 font-body text-base text-on-surface outline-none transition focus:border-brand-navy focus-visible:ring-2 focus-visible:ring-brand-navy/20"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="login-password"
              className="font-label text-sm font-semibold text-slate-700"
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
                aria-invalid={Boolean(error) || undefined}
                className="h-12 w-full rounded-lg border border-slate-300 bg-surface-white px-3.5 pr-12 font-body text-base text-on-surface outline-none transition focus:border-brand-navy focus-visible:ring-2 focus-visible:ring-brand-navy/20"
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

          <button
            type="submit"
            disabled={pending}
            className="mt-1 flex h-12 min-h-12 w-full items-center justify-center rounded-lg bg-brand-navy px-4 font-label text-sm font-semibold uppercase tracking-[0.08em] text-surface-white transition hover:bg-brand-royal-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

          <p className="mt-7 text-center font-body text-xs text-slate-500">
            Authorized personnel only. Contact your administrator if you need access.
          </p>
        </section>
      </div>
    </main>
  );
}
