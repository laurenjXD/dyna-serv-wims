// <InviteUserModal> — the "Invite User" flow (specs/21-user-profile-and-settings
// design.md §2.1, §3.1, tasks.md Task 21.7).
//
// Step 1 (email + display name) and Step 2 (role, with the party_id
// conditional fade-in for `party_user`) are combined into a single form per
// design.md §2.1's "multi-step or dynamic form" — implemented here as one
// dynamic form (simpler office pattern; no step state to manage) rather than
// a literal wizard, since design.md explicitly allows either shape.

"use client";

import { useState, type FormEvent } from "react";
import {
  inviteUserSchema,
  type InviteUserInput,
} from "@/lib/user-settings/schemas";
import { SYSTEM_ROLE_OPTIONS } from "@/lib/user-settings/roles";
import type { ActivePartyOption } from "@/app/(authenticated)/settings/team/actions";

export function InviteUserModal({
  parties,
  onClose,
  onInvite,
}: {
  parties: ActivePartyOption[];
  onClose: () => void;
  onInvite: (input: InviteUserInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<InviteUserInput["role"]>("warehouse_staff");
  const [partyId, setPartyId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const requiresParty = role === "party_user";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);

    const candidate = {
      email,
      displayName,
      role,
      partyId: requiresParty && partyId ? partyId : undefined,
    };
    const parsed = inviteUserSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "form";
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await onInvite(parsed.data);
    setSubmitting(false);
    if (!result.ok) {
      setServerError(result.error ?? "Failed to send invitation.");
      return;
    }
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-user-title"
      data-testid="invite-user-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/40 p-4"
    >
      {/* Modal surface — Level 2 elevation per brand-design-system.md §6. */}
      <div className="w-full max-w-md rounded-md bg-surface-white p-6 shadow-elevation-2">
        <h2
          id="invite-user-title"
          className="font-heading text-headline-md font-semibold text-on-surface"
        >
          Invite User
        </h2>

        <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="invite-email"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Email address
            </label>
            <input
              id="invite-email"
              data-testid="invite-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            {errors.email && (
              <p role="alert" className="font-body text-body-sm text-brand-red">
                {errors.email}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="invite-display-name"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Display name
            </label>
            <input
              id="invite-display-name"
              data-testid="invite-display-name-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            {errors.displayName && (
              <p role="alert" className="font-body text-body-sm text-brand-red">
                {errors.displayName}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="invite-role"
              className="font-label text-label uppercase tracking-wide text-on-surface"
            >
              Role
            </label>
            <select
              id="invite-role"
              data-testid="invite-role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as InviteUserInput["role"])}
              className="rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              {SYSTEM_ROLE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional UI: fades in only for party_user (design.md §2.1
              step 5, FR-4.2). */}
          {requiresParty && (
            <div className="flex flex-col gap-1" data-testid="invite-party-field">
              <label
                htmlFor="invite-party"
                className="font-label text-label uppercase tracking-wide text-on-surface"
              >
                Party (vendor/customer)
              </label>
              <select
                id="invite-party"
                data-testid="invite-party-select"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="">Select a party…</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
              {errors.partyId && (
                <p role="alert" className="font-body text-body-sm text-brand-red">
                  {errors.partyId}
                </p>
              )}
            </div>
          )}

          {serverError && (
            <p role="alert" className="font-body text-body-md text-brand-red">
              {serverError}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-11 items-center rounded border-2 border-outline-variant/30 px-4 font-label text-label uppercase tracking-wide text-on-surface hover:bg-surface-light-grey"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="invite-submit"
              disabled={submitting}
              className="flex min-h-11 items-center rounded bg-brand-red px-4 font-label text-label uppercase tracking-wide text-surface-white hover:bg-brand-red/90 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
