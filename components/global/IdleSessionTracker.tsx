"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/app/(authenticated)/actions";

interface IdleSessionTrackerProps {
  mobileTimeoutMinutes?: number;
  desktopTimeoutMinutes?: number;
  tier?: "floor" | "office" | "party";
}

export function IdleSessionTracker({
  mobileTimeoutMinutes = 15,
  desktopTimeoutMinutes = 60,
  tier = "office",
}: IdleSessionTrackerProps) {
  const router = useRouter();
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Detect mobile touch or floor tier
    const isMobile =
      tier === "floor" ||
      (typeof window !== "undefined" &&
        ("ontouchstart" in window || navigator.maxTouchPoints > 0));

    const timeoutMinutes = isMobile ? mobileTimeoutMinutes : desktopTimeoutMinutes;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    function resetActivity() {
      lastActivityRef.current = Date.now();
    }

    async function checkIdle() {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMs) {
        if (timerRef.current) clearInterval(timerRef.current);
        try {
          await signOutAction();
        } catch {
          // ignore signout errors
        }
        router.push("/login?reason=idle_timeout");
      }
    }

    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, resetActivity, { passive: true });
    });

    // Check idle status every 15 seconds
    timerRef.current = setInterval(checkIdle, 15000);

    // Also check on tab visibility change (e.g. phone screen unlocked or tab brought to foreground)
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void checkIdle();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, resetActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mobileTimeoutMinutes, desktopTimeoutMinutes, tier, router]);

  return null;
}
