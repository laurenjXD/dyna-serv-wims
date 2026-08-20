"use client";

// Opens a short-lived signed URL (specs/04-services-and-infrastructure
// design.md §10.2: "Signed URLs are short-lived (<= 60 minutes)") for the
// WRR's attached CIPL document, fetched fresh on each click rather than
// stored/cached — the object is in a private bucket, so there is no public
// URL to link to directly.

import { useState } from "react";

export type SignedUrlResult = { ok: true; url: string } | { ok: false; error: string };

export function CiplDocumentLink({
  onGetSignedUrl,
}: {
  onGetSignedUrl: () => Promise<SignedUrlResult>;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setError(null);
    const result = await onGetSignedUrl();
    if (result.ok) {
      window.open(result.url, "_blank", "noopener,noreferrer");
      setStatus("idle");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="inline-flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
      >
        {status === "loading" ? "Opening…" : "View CIPL Document"}
      </button>
      {error && (
        <p role="alert" className="mt-1 font-body text-body-sm text-brand-red">
          {error}
        </p>
      )}
    </div>
  );
}
