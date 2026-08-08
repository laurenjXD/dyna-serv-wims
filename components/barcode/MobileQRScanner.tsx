"use client";

// specs/18-barcode-integration FR-1, FR-2, FR-2.3, AC-1, AC-2, AC-4
// Floor surface component — no glassmorphism, active: press feedback.

import { useEffect, useRef } from "react";
import {
  Html5QrcodeScanner,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";

// R11 scoped exception: WAN:<uuid> is the only valid Code 128 payload.
// Validate both the prefix and the UUID shape to prevent misinterpretation.
const WAN_UUID_PATTERN =
  /^WAN:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MobileQRScannerProps {
  onScan: (payload: string) => void;
  /** Default false — Code 128 only accepted on the R11 advance-notice route. */
  allowCode128?: boolean;
  /** When true the scanner is active but decode callbacks are suppressed. */
  paused?: boolean;
}

interface ScannerInstance {
  render: (
    onSuccess: (decodedText: string) => void,
    onError: (error: string) => void,
  ) => void;
  pause: () => void;
  clear: () => Promise<void>;
}

/**
 * Instantiate the scanner, handling Vitest 4's mock environment where
 * `vi.fn().mockImplementation(arrowFn)` produces a Proxy over a non-constructable
 * arrow function. In that environment `new Html5QrcodeScanner(...)` throws
 * "not a constructor"; calling without `new` works because the Proxy is still
 * callable. In production the real ES6 class requires `new`.
 */
function createScanner(id: string, config: object): ScannerInstance {
  try {
    return new (
      Html5QrcodeScanner as unknown as new (
        id: string,
        config: object,
        verbose: boolean,
      ) => ScannerInstance
    )(id, config, false);
  } catch (e) {
    if (e instanceof TypeError && /not a constructor/i.test(String(e))) {
      // Test environment: vi.fn() Proxy is callable but not constructable.
      return (
        Html5QrcodeScanner as unknown as (
          id: string,
          config: object,
          verbose: boolean,
        ) => ScannerInstance
      )(id, config, false);
    }
    throw e;
  }
}

export function MobileQRScanner({
  onScan,
  allowCode128 = false,
  paused = false,
}: MobileQRScannerProps) {
  // Use refs so the stable effect closure always reads the latest prop values
  // without needing to recreate the scanner on every render.
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  const allowCode128Ref = useRef(allowCode128);

  // Keep refs in sync with props on every render (cheaper than effect deps).
  pausedRef.current = paused;
  onScanRef.current = onScan;
  allowCode128Ref.current = allowCode128;

  useEffect(() => {
    // FR-2.1/FR-2.2: ordinary contexts are strictly 2D.
    // FR-2.3: R11 route additionally accepts Code 128 for WAN:<uuid> payloads.
    const formatsToSupport = allowCode128Ref.current
      ? [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
        ]
      : [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ];

    const scanner = createScanner("html5qr-code-full-region", {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      formatsToSupport,
    });

    scanner.render(
      (decodedText: string) => {
        // design.md §1.1 paused prop: suppress callbacks when paused.
        if (pausedRef.current) return;

        // FR-2.3: WAN: prefix signals a Code 128 payload from a supplier label.
        // Reject in every context where allowCode128 is not explicitly set,
        // and validate the UUID shape even when it is set.
        if (decodedText.startsWith("WAN:")) {
          if (!allowCode128Ref.current) return;
          if (!WAN_UUID_PATTERN.test(decodedText)) return;
        }

        // design.md §1.1: pause immediately after a valid decode to prevent
        // rapid double-fires before the caller has a chance to react.
        scanner.pause();
        onScanRef.current(decodedText);
      },
      (_errorMessage: string) => {
        // Decode errors are normal during live camera scanning (partial frames).
        // Silently ignore — the scanner retries on the next frame.
      },
    );

    return () => {
      // Cleanup on unmount — stop scanner and release camera resource.
      scanner.clear().catch(() => {});
    };
  }, []);

  // Floor surface: solid `surface-white`, no glassmorphism, `shadow-elevation-2`.
  // The scanner library injects the camera feed into this div by id.
  return (
    <div
      id="html5qr-code-full-region"
      className="w-full max-w-md mx-auto bg-surface-white shadow-elevation-2 rounded overflow-hidden"
    />
  );
}
