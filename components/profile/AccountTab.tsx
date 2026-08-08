// Account tab — <AvatarUpload>, <DisplayNameInput>, <ContactNumberInput>.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.1 and
// tasks.md Task 21.2. FR-1.2 ("Email addresses SHALL remain read-only").

"use client";

import { useState, type FormEvent } from "react";
import type { OwnProfile } from "@/app/(authenticated)/profile/actions";
import { updateDisplayName } from "@/app/(authenticated)/profile/actions";
import { displayNameSchema } from "@/lib/user-settings/schemas";

export function AccountTab({ profile }: { profile: OwnProfile }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = displayNameSchema.safeParse({ displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid display name");
      return;
    }

    setStatus("saving");
    const result = await updateDisplayName({ displayName: parsed.data.displayName });
    if (!result.ok) {
      setError(result.error);
      setStatus("idle");
      return;
    }
    setStatus("saved");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* <AvatarUpload> — real Supabase Storage upload wiring is a seam gap:
          no avatar bucket/policy has been defined by this or any dependency
          spec yet (lib/supabase/storage.ts's own header notes bucket
          names/policies are "defined per-feature once that feature's
          tasks.md is Approved" — no avatars bucket exists). Renders the
          picker UI only; submission is intentionally disabled. */}
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-royal-blue font-heading text-headline-md font-semibold text-surface-white"
        >
          {profile.displayName.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div>
          <label
            htmlFor="avatar-upload"
            className="inline-flex min-h-14 cursor-not-allowed items-center rounded border-2 border-outline-variant/30 px-4 font-label text-body-md uppercase tracking-wide text-on-surface"
            title="Avatar upload is not wired to storage yet (seam gap — no avatars bucket defined)"
          >
            Change photo
          </label>
          <input id="avatar-upload" type="file" accept="image/*" disabled className="sr-only" />
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="account-email"
            className="font-label text-body-md uppercase tracking-wide text-on-surface"
          >
            Email
          </label>
          <input
            id="account-email"
            type="email"
            value={profile.email ?? ""}
            disabled
            readOnly
            className="min-h-14 rounded border border-outline-variant/30 bg-surface-light-grey px-3 py-2 font-body text-body-md text-on-surface"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="account-display-name"
            className="font-label text-body-md uppercase tracking-wide text-on-surface"
          >
            Display name
          </label>
          <input
            id="account-display-name"
            data-testid="display-name-input"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setStatus("idle");
            }}
            className="min-h-14 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
        </div>

        {/* <ContactNumberInput> — no backing column on user_profiles yet
            (see app/(authenticated)/profile/actions.ts's header comment,
            seam gap 1). Rendered read-only/disabled rather than silently
            faking a save. */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="account-contact-number"
            className="font-label text-body-md uppercase tracking-wide text-on-surface"
          >
            Contact number
          </label>
          <input
            id="account-contact-number"
            type="tel"
            disabled
            placeholder="Not available yet"
            title="Contact number has no backing column on user_profiles yet (02-rbac-roles schema seam gap)"
            className="min-h-14 rounded border border-outline-variant/30 bg-surface-light-grey px-3 py-2 font-body text-body-md text-on-surface"
          />
        </div>

        {error && (
          <p role="alert" className="font-body text-body-md text-brand-red">
            {error}
          </p>
        )}
        {status === "saved" && (
          <p role="status" className="font-body text-body-md text-status-available">
            Saved.
          </p>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          data-testid="save-display-name"
          className="mt-2 flex min-h-14 w-full items-center justify-center rounded bg-brand-navy px-4 font-label text-body-md uppercase tracking-wide text-surface-white transition-transform duration-0 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
