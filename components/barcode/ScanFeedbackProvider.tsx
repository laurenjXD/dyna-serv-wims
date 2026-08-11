"use client";

// specs/18-barcode-integration FR-4.1, FR-4.2, AC-2
// Floor surface: solid color flash, no glassmorphism, no hover.
// brand-design-system.md §9/§10: full-screen color flash is functional feedback,
// highest priority, must not be delayed. Solid color only (never translucent).

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type FeedbackState = "idle" | "success" | "error";

interface ScanFeedbackContextValue {
  triggerSuccess: () => void;
  triggerError: () => void;
}

const ScanFeedbackContext = createContext<ScanFeedbackContextValue | null>(null);

/** Duration of the full-screen flash in milliseconds. */
const FLASH_DURATION_MS = 800;

type WindowWithAudio = Window &
  typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };

export function ScanFeedbackProvider({ children }: { children: ReactNode }) {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle");

  const triggerSuccess = useCallback(() => {
    setFeedbackState("success");

    // FR-4.2: synthesise a short 800Hz beep via Web Audio API on success.
    // Wrapped in try/catch — some browsers (and jsdom) block AudioContext.
    try {
      // Prefer the standard AudioContext; fall back to the webkit-prefixed form
      // on older iOS Safari versions still common in warehouses.
      const AudioCtx =
        (window as WindowWithAudio).AudioContext ??
        (window as WindowWithAudio).webkitAudioContext;

      if (AudioCtx) {
        const ctx = new AudioCtx();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(800, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.start();
        // 100ms beep per design.md §1.2
        oscillator.stop(ctx.currentTime + 0.1);
      }
    } catch {
      // Audio unavailable — visual feedback continues unaffected.
    }

    setTimeout(() => setFeedbackState("idle"), FLASH_DURATION_MS);
  }, []);

  const triggerError = useCallback(() => {
    setFeedbackState("error");
    // No audio on error — beep is success-only per design.md §1.2.
    setTimeout(() => setFeedbackState("idle"), FLASH_DURATION_MS);
  }, []);

  return (
    <ScanFeedbackContext.Provider value={{ triggerSuccess, triggerError }}>
      {children}

      {/*
        brand-design-system.md §9/§10:
        Full-screen flash uses opacity/color transition only (no scale/transform).
        Floor surface: solid color, never translucent — no glassmorphism, no backdrop-blur.
        status-success for success, status-error for error (§1.3 semantic set).
        pointer-events-none so the overlay never intercepts touches on floor screens.
      */}
      <div
        data-testid="scan-feedback-overlay"
        data-state={feedbackState}
        className={[
          "fixed inset-0 z-50 pointer-events-none motion-safe:transition-opacity motion-safe:duration-150",
          feedbackState === "success" ? "bg-status-success opacity-100" : "",
          feedbackState === "error" ? "bg-status-error opacity-100" : "",
          feedbackState === "idle" ? "opacity-0" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />

      {/*
        Accessible announcement for screen-reader users and automated tests.
        aria-live="assertive" ensures immediate announcement without waiting for
        the reader's natural reading cycle — required for time-critical floor actions
        per brand-design-system.md §5 (WCAG AAA for immediate physical action feedback).
      */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {feedbackState === "success" ? "Scan accepted" : ""}
        {feedbackState === "error" ? "Scan rejected" : ""}
      </div>
    </ScanFeedbackContext.Provider>
  );
}

/**
 * Returns the scan feedback trigger functions provided by the nearest
 * ScanFeedbackProvider.
 *
 * Throws if called outside a provider — intentional design safety contract.
 */
export function useScanFeedback(): ScanFeedbackContextValue {
  const ctx = useContext(ScanFeedbackContext);
  if (ctx === null) {
    throw new Error(
      "useScanFeedback() must be called inside a <ScanFeedbackProvider>. " +
        "Wrap the component tree that needs scan feedback in <ScanFeedbackProvider>.",
    );
  }
  return ctx;
}
