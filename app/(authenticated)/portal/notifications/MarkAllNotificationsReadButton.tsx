"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { markAllNotificationsReadAction } from "@/lib/actions/notifications";

export function MarkAllNotificationsReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setIsPending(true);
    setError(null);
    try {
      const result = await markAllNotificationsReadAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to update notifications. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isPending}
        title={disabled ? "There are no unread notifications" : undefined}
        className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckCircle2 size={16} aria-hidden="true" />
        {isPending ? "Updating…" : "Mark all as read"}
      </button>
      {error && <p className="text-right font-body text-body-sm text-status-held">{error}</p>}
    </div>
  );
}
