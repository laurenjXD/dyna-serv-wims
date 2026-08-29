"use client";

// specs/18-barcode-integration FR-1, FR-2, FR-2.3, AC-1, AC-2, AC-4
// Floor surface component — direct rear-camera stream with zero permission button prompts.

import { useEffect, useRef } from "react";
import {
  Html5Qrcode,
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
  start?: (
    cameraConfig: object,
    config: object,
    onSuccess: (decodedText: string) => void,
    onError: (error: string) => void,
  ) => Promise<void>;
  render?: (
    onSuccess: (decodedText: string) => void,
    onError: (error: string) => void,
  ) => void;
  pause: () => void;
  stop?: () => Promise<void>;
  clear: () => Promise<void>;
  isScanning?: boolean;
}

function createScanner(id: string, config: object): ScannerInstance | null {
  try {
    return new (
      Html5Qrcode as unknown as new (
        id: string,
        config: object,
      ) => ScannerInstance
    )(id, config);
  } catch (e) {
    if (e instanceof TypeError && /not a constructor/i.test(String(e))) {
      return (
        Html5Qrcode as unknown as (
          id: string,
          config: object,
        ) => ScannerInstance
      )(id, config);
    }
  }
  return null;
}

export function MobileQRScanner({
  onScan,
  allowCode128 = false,
  paused = false,
}: MobileQRScannerProps) {
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  const allowCode128Ref = useRef(allowCode128);

  // Keep refs in sync with props on every render.
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

    const elementId = "html5qr-code-full-region";
    let isMounted = true;

    const scannerInstance = createScanner(elementId, {
      formatsToSupport,
      verbose: false,
    });

    const handleSuccess = (decodedText: string) => {
      if (pausedRef.current) return;

      if (decodedText.startsWith("WAN:")) {
        if (!allowCode128Ref.current) return;
        if (!WAN_UUID_PATTERN.test(decodedText)) return;
      }

      if (scannerInstance?.pause) {
        scannerInstance.pause();
      }
      onScanRef.current(decodedText);
    };

    const handleError = (_errorMessage: string) => {
      // Ignore normal per-frame non-matches
    };

    const scannerConfig = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      formatsToSupport,
    };

    if (scannerInstance) {
      if (typeof scannerInstance.start === "function") {
        // Default directly to rear camera ({ facingMode: "environment" }) with no permission prompt button
        scannerInstance
          .start(
            { facingMode: "environment" },
            scannerConfig,
            handleSuccess,
            handleError,
          )
          ?.catch(() => {
            if (!isMounted) return;
            // Graceful fallback to user/webcam if environment/rear camera is unavailable
            scannerInstance
              .start?.(
                { facingMode: "user" },
                scannerConfig,
                handleSuccess,
                handleError,
              )
              ?.catch(() => {});
          });
      } else if (typeof scannerInstance.render === "function") {
        scannerInstance.render(handleSuccess, handleError);
      }
    }

    return () => {
      isMounted = false;
      if (scannerInstance) {
        try {
          if (scannerInstance.isScanning && scannerInstance.stop) {
            scannerInstance
              .stop()
              .then(() => {
                scannerInstance.clear?.();
              })
              .catch(() => {});
          } else if (scannerInstance.clear) {
            scannerInstance.clear().catch?.(() => {});
          }
        } catch {}
      }
    };
  }, []);

  return (
    <div
      id="html5qr-code-full-region"
      className="w-full max-w-md mx-auto bg-surface-white shadow-elevation-2 rounded overflow-hidden"
    />
  );
}
