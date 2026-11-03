"use client";

import { useOfflineStatus } from "@/lib/offline/provider";
import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function OnlineOnlySubmitButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const { connectivity } = useOfflineStatus();
  const { pending } = useFormStatus();
  const offline = connectivity === "offline";
  const disabled = offline || pending || props.disabled;
  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      disabled={disabled}
      aria-busy={pending || undefined}
      title={
        offline
          ? "Reconnect to complete this authoritative warehouse action."
          : pending
            ? "Saving the receipt..."
            : props.title
      }
    >
      {pending ? "Saving..." : children}
    </button>
  );
}
