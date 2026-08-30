// @vitest-environment jsdom
//
// RED-step tests for `components/barcode/MobileQRScanner.tsx`, which does
// not exist yet.
//
// Traceability:
//   specs/18-barcode-integration/requirements.md
//     AC-1  — Camera activates and renders live feed
//     AC-2  — Successful decode plays beep, flashes green, passes payload
//     AC-4  — Code 128 accepted only on the R11 route; rejected everywhere else
//
//   specs/18-barcode-integration/requirements.md FR-1, FR-2, FR-2.3:
//     FR-1.1 — Distinct UI scan button (64x64px camera icon)
//     FR-2.1 — Strictly 2D barcodes in all ordinary contexts
//     FR-2.2 — 1D/Code 128 is forbidden outside the FR-2.3 exception
//     FR-2.3 — Code 128 accepted on R11 route; payload must be WAN:<uuid>
//
//   specs/18-barcode-integration/design.md §1.1:
//     Component contract: onScan prop receives decoded payload; allowCode128
//     prop gates Code 128 support; paused prop halts decode callbacks;
//     scanner.pause() is called automatically after a successful decode to
//     prevent rapid double-fires.
//
// Component contract being tested (implementation does NOT exist yet):
//
//   export function MobileQRScanner(props: {
//     onScan: (payload: string) => void;
//     allowCode128?: boolean;   // default false; true only on R11 advance-notice route
//     paused?: boolean;
//   }): JSX.Element
//
// `html5-qrcode` is mocked because it uses camera APIs unavailable in jsdom.
// The mock exposes a `__simulateScan` helper that lets tests trigger a decode
// callback from the simulated scanner instance.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MobileQRScanner } from "@/components/barcode/MobileQRScanner";

// ---------------------------------------------------------------------------
// html5-qrcode mock
// ---------------------------------------------------------------------------

// The scanner instance created by the component is captured here so tests can
// call __simulateScan to fire a decode callback, and inspect whether pause()
// was called.
let capturedScanSuccessCallback: ((decodedText: string) => void) | null = null;
let mockPauseFn: ReturnType<typeof vi.fn>;

vi.mock("html5-qrcode", () => {
  // Reset per-instance state on each construction so tests are independent.
  const Html5Qrcode = vi.fn().mockImplementation(
    function (_elementId: string, config: { formatsToSupport?: number[] }) {
      mockPauseFn = vi.fn();
      return {
        start: vi.fn(
          (
            _cameraConfig: unknown,
            _config: unknown,
            onSuccess: (decodedText: string) => void,
            _onError: (error: string) => void,
          ) => {
            capturedScanSuccessCallback = onSuccess;
            return Promise.resolve();
          },
        ),
        render: vi.fn(
          (
            onSuccess: (decodedText: string) => void,
            _onError: (error: string) => void,
          ) => {
            capturedScanSuccessCallback = onSuccess;
          },
        ),
        pause: mockPauseFn,
        stop: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        isScanning: true,
        _config: config,
      };
    },
  );

  const Html5QrcodeScanner = Html5Qrcode;

  const Html5QrcodeSupportedFormats = {
    QR_CODE: 0,
    DATA_MATRIX: 1,
    CODE_128: 2,
  };

  return { Html5Qrcode, Html5QrcodeScanner, Html5QrcodeSupportedFormats };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateScan(payload: string) {
  if (!capturedScanSuccessCallback) {
    throw new Error(
      "No scan callback captured — did the component call scanner.render()?",
    );
  }
  capturedScanSuccessCallback(payload);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MobileQRScanner (specs/18-barcode-integration FR-1, FR-2, FR-2.3, AC-1, AC-2, AC-4)", () => {
  beforeEach(() => {
    capturedScanSuccessCallback = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // AC-1 / FR-1.1 — Component renders without crashing
  // -------------------------------------------------------------------------
  it("AC-1: renders without crashing (html5-qrcode camera APIs absent in jsdom)", () => {
    // Should not throw even though jsdom has no real camera/getUserMedia.
    expect(() =>
      render(<MobileQRScanner onScan={() => {}} />),
    ).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // AC-2 — Calls onScan with decoded payload on successful decode
  // -------------------------------------------------------------------------
  it("AC-2: calls onScan with the decoded payload when the scanner fires a result", () => {
    const onScan = vi.fn();
    render(<MobileQRScanner onScan={onScan} />);

    simulateScan('{"dsw_id":"a1b2c3d4-1111-2222-3333-444444444444"}');

    expect(onScan).toHaveBeenCalledOnce();
    expect(onScan).toHaveBeenCalledWith(
      '{"dsw_id":"a1b2c3d4-1111-2222-3333-444444444444"}',
    );
  });

  // -------------------------------------------------------------------------
  // Paused prop — scanner must not fire callbacks when paused
  // -------------------------------------------------------------------------
  it("does NOT call onScan when paused={true} (design.md §1.1 paused prop)", () => {
    const onScan = vi.fn();
    render(<MobileQRScanner onScan={onScan} paused={true} />);

    simulateScan('{"dsw_id":"a1b2c3d4-1111-2222-3333-444444444444"}');

    expect(onScan).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // FR-2.1 / FR-2.2 — Code 128 must be rejected when allowCode128 is false
  // -------------------------------------------------------------------------
  it("FR-2.2: does NOT call onScan for a Code 128 decode when allowCode128={false} (default)", () => {
    const onScan = vi.fn();
    // allowCode128 defaults to false — Code 128 payloads must be dropped.
    render(<MobileQRScanner onScan={onScan} />);

    // Simulate a raw Code 128 decode. The component must reject it because
    // allowCode128 is false (FR-2.1/FR-2.2 restriction).
    simulateScan("WAN:a1b2c3d4-1111-2222-3333-444444444444");

    expect(onScan).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // FR-2.3 — Code 128 WAN:<uuid> accepted when allowCode128={true}
  // -------------------------------------------------------------------------
  it("FR-2.3: DOES call onScan for a Code 128 decode when allowCode128={true} (R11 route only)", () => {
    const onScan = vi.fn();
    render(<MobileQRScanner onScan={onScan} allowCode128={true} />);

    simulateScan("WAN:a1b2c3d4-1111-2222-3333-444444444444");

    expect(onScan).toHaveBeenCalledOnce();
    expect(onScan).toHaveBeenCalledWith(
      "WAN:a1b2c3d4-1111-2222-3333-444444444444",
    );
  });

  // -------------------------------------------------------------------------
  // design.md §1.1 — Auto-pause after first successful decode
  // -------------------------------------------------------------------------
  it("design.md §1.1: auto-pauses after a successful decode to prevent rapid double-fires", () => {
    const onScan = vi.fn();
    render(<MobileQRScanner onScan={onScan} />);

    simulateScan('{"dsw_id":"a1b2c3d4-1111-2222-3333-444444444444"}');

    // The scanner's pause() method must be called exactly once after decode.
    expect(mockPauseFn).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // FR-2.3 — WAN:<uuid> passthrough when allowCode128={true}
  // -------------------------------------------------------------------------
  it("FR-2.3: a valid WAN:<uuid> payload passes through onScan when allowCode128={true}", () => {
    const onScan = vi.fn();
    render(<MobileQRScanner onScan={onScan} allowCode128={true} />);

    const payload = "WAN:00000000-0000-0000-0000-000000000001";
    simulateScan(payload);

    expect(onScan).toHaveBeenCalledWith(payload);
  });

  // -------------------------------------------------------------------------
  // FR-2.3 — WAN:<invalid> rejected even when allowCode128={true}
  // -------------------------------------------------------------------------
  it("FR-2.3: a WAN:<non-uuid> payload is rejected even when allowCode128={true} (design.md §2 WAN:<uuid> validation)", () => {
    const onScan = vi.fn();
    render(<MobileQRScanner onScan={onScan} allowCode128={true} />);

    // "not-a-uuid" is not a valid UUID; the component must validate the shape.
    simulateScan("WAN:not-a-uuid");

    expect(onScan).not.toHaveBeenCalled();
  });
});
