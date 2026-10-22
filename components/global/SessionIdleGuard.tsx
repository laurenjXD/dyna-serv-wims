"use client";

import { useEffect, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export function SessionIdleGuard({
  mobileIdleTimeoutMinutes,
  desktopIdleTimeoutMinutes,
  children,
}: {
  mobileIdleTimeoutMinutes: number;
  desktopIdleTimeoutMinutes: number;
  children: ReactNode;
}) {
  useEffect(() => {
    let lastActivity = Date.now();
    let signingOut = false;
    const touch = () => { lastActivity = Date.now(); };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));
    const isMobile = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const timeoutMs = (isMobile ? mobileIdleTimeoutMinutes : desktopIdleTimeoutMinutes) * 60_000;
    const timer = window.setInterval(async () => {
      if (signingOut || Date.now() - lastActivity < timeoutMs) return;
      signingOut = true;
      await createClient().auth.signOut();
      window.location.assign("/login?reason=idle_timeout");
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, touch));
    };
  }, [desktopIdleTimeoutMinutes, mobileIdleTimeoutMinutes]);

  return <>{children}</>;
}
