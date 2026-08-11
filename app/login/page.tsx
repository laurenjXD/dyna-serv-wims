// Login page — office surface (not floor).
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §3 (unauthenticated entry:
//   single sign-in/recovery boundary from 04-services-and-infrastructure)
//   and §7 (server-validated session; never trust client-supplied identity).
// - specs/00-steering/brand-design-system.md §9 (office button: 44px height,
//   primary primary button; form inputs: primary focus ring).
//
// Uses createClient() from @/lib/supabase/client (the SSR browser client)
// for the auth call only — the server session resolver remains authoritative
// for the protected shell's session state.

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // On success, return to the authenticated shell's landing route.
      // router.refresh() alongside push (2026-08-08): App Router's client
      // Router Cache can otherwise serve a stale RSC payload for `/` from
      // before sign-in; refresh() drops that cache and forces a fresh
      // server-side render under the new session, working together with
      // middleware.ts's cookie refresh (added the same day — without it,
      // a successful sign-in appeared to redirect nowhere).
      router.push("/");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-dim p-4">
      <div className="w-full max-w-sm rounded bg-white p-8 shadow-elevation-2">
        {/* Brand word-mark */}
        <div className="mb-8 text-center">
          <span className="font-label text-headline-md font-semibold text-primary">
            Dyna-Serv WIMS
          </span>
        </div>

        <h1 className="mb-6 font-heading text-headline-md font-semibold text-primary">
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
              className="rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="login-password"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Inline error — shown only when auth fails. */}
          {error && (
            <p
              role="alert"
              className="font-body text-body-md text-status-error"
            >
              {error}
            </p>
          )}

          {/* Office primary button: primary solid, 44px height min,
              Epilogue SemiBold label per brand-design-system §9. */}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded bg-primary px-4 font-label text-label uppercase tracking-wide text-white hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
