"use client";

import { useOfflineStatus } from "@/lib/offline/provider";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function OnlineOnlySubmitButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const { connectivity } = useOfflineStatus();
  const offline = connectivity === "offline";
  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      disabled={offline || props.disabled}
      title={offline ? "Reconnect to complete this authoritative warehouse action." : props.title}
    >
      {children}
    </button>
  );
}
