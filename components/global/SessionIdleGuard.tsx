"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const lastActivityRef = useRef(Date.now());
  const [warningOpen, setWarningOpen] = useState(false);
  useEffect(() => {
    let signingOut = false;
    const touch = () => { lastActivityRef.current = Date.now(); setWarningOpen(false); };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));
    const isMobile = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const timeoutMs = (isMobile ? mobileIdleTimeoutMinutes : desktopIdleTimeoutMinutes) * 60_000;
    const warningMs = Math.min(5 * 60_000, Math.max(30_000, Math.floor(timeoutMs / 2)));
    const timer = window.setInterval(async () => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (!signingOut && idleMs >= timeoutMs - warningMs && idleMs < timeoutMs) setWarningOpen(true);
      if (signingOut || idleMs < timeoutMs) return;
      signingOut = true;
      await createClient().auth.signOut();
      window.location.assign("/login?reason=idle_timeout");
    }, 5_000);
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, touch));
    };
  }, [desktopIdleTimeoutMinutes, mobileIdleTimeoutMinutes]);

  return <>
    {children}
    {warningOpen && (
      <div role="dialog" aria-modal="true" aria-labelledby="idle-warning-title" className="fixed inset-0 z-[100] flex items-end bg-slate-950/45 p-4 sm:items-center sm:justify-center">
        <section className="w-full max-w-md rounded-2xl bg-surface-white p-6 shadow-elevation-3">
          <h2 id="idle-warning-title" className="font-heading text-lg font-bold text-on-surface">Your session is about to time out</h2>
          <p className="mt-2 font-body text-sm text-text-grey">You have been inactive. Continue working to keep this local session active. Your sign-in still follows the organization&apos;s provider security policy.</p>
          <button type="button" onClick={() => { lastActivityRef.current = Date.now(); setWarningOpen(false); }} className="mt-5 min-h-11 w-full rounded-xl bg-brand-navy px-4 font-label font-bold text-surface-white">Continue session</button>
        </section>
      </div>
    )}
  </>;
}
