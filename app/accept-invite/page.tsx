// Invitation-acceptance landing page — the page an invited user reaches
// after clicking the email invite link (Supabase Auth's invite flow
// establishes a session for this URL automatically via the browser client's
// `detectSessionInUrl`).
//
// Traceability: specs/21-user-profile-and-settings/design.md §4.2 and
// tasks.md Task 21.10 ("Allow the user to set initial display name and
// preferences; do not expose role or party-scope fields").
//
// Rendered OUTSIDE the (authenticated) route group deliberately: an invited
// user's profile status is `invited`, not `active`, so
// AuthenticatedShellBoundary would correctly show the safe forbidden/empty
// state for them (they have no usable grants yet) — this page needs its own
// minimal, unauthenticated-shell-adjacent layout, mirroring app/login's
// pattern.

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { completeInvitationAcceptance } from "./actions";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await completeInvitationAcceptance({
      displayName,
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-dim p-4">
      <div className="w-full max-w-sm rounded bg-white p-8 shadow-elevation-2">
        <div className="mb-8 text-center">
          <span className="font-label text-headline-md font-semibold text-primary">
            Dyna-Serv WIMS
          </span>
        </div>

        <h1 className="mb-2 font-heading text-headline-md font-semibold text-primary">
          Welcome
        </h1>
        <p className="mb-6 font-body text-body-md text-on-surface-variant">
          Set your name and password to finish setting up your account. Your role and access
          were already assigned by an administrator and can&apos;t be changed here.
        </p>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="accept-display-name"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Display name
            </label>
            <input
              id="accept-display-name"
              data-testid="accept-display-name-input"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="accept-password"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Password
            </label>
            <input
              id="accept-password"
              data-testid="accept-password-input"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="accept-confirm-password"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Confirm password
            </label>
            <input
              id="accept-confirm-password"
              data-testid="accept-confirm-password-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {error && (
            <p role="alert" className="font-body text-body-md text-action-blue">
              {error}
            </p>
          )}

          <button
            type="submit"
            data-testid="accept-invite-submit"
            disabled={pending}
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded bg-primary px-4 font-label text-label uppercase tracking-wide text-white hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {pending ? "Finishing setup…" : "Finish setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
