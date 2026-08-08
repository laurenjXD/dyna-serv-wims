// @vitest-environment jsdom
//
// RED-step tests for `components/barcode/ScanFeedbackProvider.tsx`, which does
// not exist yet.
//
// Traceability:
//   specs/18-barcode-integration/requirements.md
//     AC-2 — Successful scan flashes screen green and plays audio beep
//     FR-4.1 — Visual feedback: full-screen color flash (green = success,
//               red = failure) per brand-design-system.md §9 and §10
//     FR-4.2 — Auditory feedback: short Web Audio API beep on successful decode
//
//   specs/00-steering/brand-design-system.md
//     §1.3 — status-available (#10B981) for success, status-held (#EF4444) for error
//     §9   — Full-screen color flash is functional feedback, highest priority,
//             must never be delayed or skipped
//     §10  — Full-screen color flash: opacity/color transition only (no
//             scale/transform), respects prefers-reduced-motion (flash stays,
//             duration may shorten)
//
// Component contract being tested (implementation does NOT exist yet):
//
//   export function ScanFeedbackProvider(props: {
//     children: React.ReactNode;
//   }): JSX.Element
//
//   export function useScanFeedback(): {
//     triggerSuccess: () => void;
//     triggerError: () => void;
//   }
//
// The provider renders an aria-live region (role="status") for accessibility
// and a full-screen overlay div for the color flash. The hook exposes the two
// trigger functions. Calling the hook outside the provider must throw.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import {
  ScanFeedbackProvider,
  useScanFeedback,
} from "@/components/barcode/ScanFeedbackProvider";

// ---------------------------------------------------------------------------
// Web Audio API mock
// ---------------------------------------------------------------------------

const mockOscillatorStart = vi.fn();
const mockOscillatorStop = vi.fn();
const mockOscillatorConnect = vi.fn();
const mockGainConnect = vi.fn();
const mockOscillator = {
  type: "sine" as OscillatorType,
  frequency: { setValueAtTime: vi.fn() },
  connect: mockOscillatorConnect,
  start: mockOscillatorStart,
  stop: mockOscillatorStop,
};
const mockGainNode = {
  connect: mockGainConnect,
  gain: { setValueAtTime: vi.fn() },
};
const mockAudioContextClose = vi.fn();
const mockAudioContext = {
  createOscillator: vi.fn(() => mockOscillator),
  createGain: vi.fn(() => mockGainNode),
  destination: {},
  currentTime: 0,
  close: mockAudioContextClose,
};

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: render a component that uses the useScanFeedback hook
// ---------------------------------------------------------------------------

function HookConsumer() {
  const { triggerSuccess, triggerError } = useScanFeedback();
  return (
    <div>
      <button onClick={triggerSuccess} data-testid="success-btn">
        Success
      </button>
      <button onClick={triggerError} data-testid="error-btn">
        Error
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ScanFeedbackProvider>
      <HookConsumer />
    </ScanFeedbackProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScanFeedbackProvider (specs/18-barcode-integration FR-4.1, FR-4.2, AC-2)", () => {
  // -------------------------------------------------------------------------
  // Smoke test — provider renders children without crashing
  // -------------------------------------------------------------------------
  it("renders children without crashing", () => {
    expect(() =>
      render(
        <ScanFeedbackProvider>
          <span data-testid="child">hello</span>
        </ScanFeedbackProvider>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId("child")).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // AC-2 / FR-4.1 — triggerSuccess causes a success visual signal
  // -------------------------------------------------------------------------
  it("AC-2 / FR-4.1: triggerSuccess causes a success CSS class or aria-live region to appear briefly", async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId("success-btn").click();
    });

    // The provider must either add a success class to an overlay element or
    // update an aria-live region with a success message. We check both paths:
    // the overlay (data-testid="scan-feedback-overlay") should carry a class
    // referencing the success state token, OR an aria-live region contains
    // descriptive text indicating success.
    await waitFor(() => {
      const overlay = document.querySelector(
        '[data-testid="scan-feedback-overlay"]',
      );
      const liveRegion = document.querySelector('[aria-live]');

      const overlayHasSuccessClass =
        overlay?.className?.toLowerCase().includes("success") ||
        overlay?.className?.includes("status-available") ||
        overlay?.getAttribute("data-state") === "success";

      const liveRegionHasSuccessText =
        liveRegion?.textContent?.toLowerCase().includes("success") ||
        liveRegion?.textContent?.toLowerCase().includes("scan accepted");

      expect(overlayHasSuccessClass || liveRegionHasSuccessText).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // FR-4.1 — triggerError causes an error visual signal
  // -------------------------------------------------------------------------
  it("FR-4.1: triggerError causes an error CSS class or aria-live region to appear briefly", async () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId("error-btn").click();
    });

    await waitFor(() => {
      const overlay = document.querySelector(
        '[data-testid="scan-feedback-overlay"]',
      );
      const liveRegion = document.querySelector('[aria-live]');

      const overlayHasErrorClass =
        overlay?.className?.toLowerCase().includes("error") ||
        overlay?.className?.includes("status-held") ||
        overlay?.getAttribute("data-state") === "error";

      const liveRegionHasErrorText =
        liveRegion?.textContent?.toLowerCase().includes("error") ||
        liveRegion?.textContent?.toLowerCase().includes("scan failed") ||
        liveRegion?.textContent?.toLowerCase().includes("rejected");

      expect(overlayHasErrorClass || liveRegionHasErrorText).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC-2 / FR-4.2 — Web Audio AudioContext is called on triggerSuccess
  // -------------------------------------------------------------------------
  it("AC-2 / FR-4.2: Web Audio AudioContext is instantiated when triggerSuccess fires (audio beep)", () => {
    // Spy on window.AudioContext before rendering.
    const AudioContextSpy = vi
      .spyOn(window, "AudioContext", "get")
      .mockReturnValue(
        vi.fn(() => mockAudioContext) as unknown as typeof AudioContext,
      );

    // Fallback: directly assign if `get` spy doesn't apply in jsdom.
    const winAny = window as unknown as { AudioContext?: unknown };
    const originalAudioContext = winAny.AudioContext;
    winAny.AudioContext = vi.fn(() => mockAudioContext);

    renderWithProvider();

    act(() => {
      screen.getByTestId("success-btn").click();
    });

    // AudioContext must have been constructed. The mock records construction
    // calls via vi.fn().
    const audioCtxCalls = (
      winAny.AudioContext as ReturnType<typeof vi.fn>
    ).mock?.calls?.length;

    expect(audioCtxCalls).toBeGreaterThan(0);

    // Restore
    winAny.AudioContext = originalAudioContext;
    AudioContextSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Hook outside provider must throw (design safety contract)
  // -------------------------------------------------------------------------
  it("throws if useScanFeedback() is called outside ScanFeedbackProvider", () => {
    // Suppress React's error boundary console.error output for this test.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    function BareConsumer() {
      useScanFeedback(); // must throw — no provider ancestor
      return null;
    }

    expect(() => render(<BareConsumer />)).toThrow();

    consoleError.mockRestore();
  });
});
