"use client";

// specs/18-barcode-integration FR-1, FR-2, FR-2.3, AC-1, AC-2, AC-4
// Floor surface component — direct rear-camera stream with graceful fallback to any available camera.

import { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import { RefreshCw, AlertCircle } from "lucide-react";

// R11 scoped exception: WAN:<uuid> is the only valid Code 128 payload.
const WAN_UUID_PATTERN =
  /^WAN:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MobileQRScannerProps {
  onScan: (payload: string) => void;
  /** Default false — Code 128 only accepted on the R11 advance-notice route. */
  allowCode128?: boolean;
  /** When true the scanner is active but decode callbacks are suppressed. */
  paused?: boolean;
}

interface CameraDevice {
  id: string;
  label: string;
}

interface ScannerInstance {
  start?: (
    cameraConfig: string | object,
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
  const elementId = "html5qr-code-full-region";

  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  const allowCode128Ref = useRef(allowCode128);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Keep refs in sync with props on every render.
  pausedRef.current = paused;
  onScanRef.current = onScan;
  allowCode128Ref.current = allowCode128;

  useEffect(() => {
    let isMounted = true;
    let currentScanner: ScannerInstance | null = null;
    setIsLoading(true);
    setErrorMessage(null);

    const formatsToSupport = allowCode128Ref.current
      ? [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
        ]
      : [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ];

    const scannerConfig = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      formatsToSupport,
    };

    const handleSuccess = (decodedText: string) => {
      if (pausedRef.current) return;

      if (decodedText.startsWith("WAN:")) {
        if (!allowCode128Ref.current) return;
        if (!WAN_UUID_PATTERN.test(decodedText)) return;
      }

      if (currentScanner?.pause) {
        currentScanner.pause();
      }
      onScanRef.current(decodedText);
    };

    const handleError = (_errorMessage: string) => {
      // Ignore normal per-frame non-matches
    };

    try {
      const scannerInstance = createScanner(elementId, {
        formatsToSupport,
        verbose: false,
      });

      if (!scannerInstance) {
        setIsLoading(false);
        setErrorMessage("Scanner could not be initialized.");
        return;
      }

      currentScanner = scannerInstance;

      if (typeof scannerInstance.render === "function") {
        scannerInstance.render(handleSuccess, handleError);
        setIsLoading(false);
      } else if (typeof scannerInstance.start === "function") {
        // Enumerate cameras in background if supported
        if (typeof Html5Qrcode.getCameras === "function") {
          Html5Qrcode.getCameras()
            .then((rawDevices: any) => {
              if (!isMounted) return;
              if (rawDevices && rawDevices.length > 0) {
                setCameras(
                  rawDevices.map((d: any) => ({
                    id: d.id,
                    label: d.label || `Camera ${d.id.slice(0, 5)}`,
                  }))
                );
              }
            })
            .catch(() => {});
        }

        const cameraChoice = selectedCameraId
          ? selectedCameraId
          : { facingMode: "environment" };

        const startPromise = scannerInstance.start(
          cameraChoice,
          scannerConfig,
          handleSuccess,
          handleError,
        );

        if (startPromise && typeof startPromise.then === "function") {
          startPromise
            .then(() => {
              if (isMounted) setIsLoading(false);
            })
            .catch(() => {
              if (!isMounted) return;
              // Fallback to user facing mode / default webcam
              scannerInstance
                .start?.(
                  { facingMode: "user" },
                  scannerConfig,
                  handleSuccess,
                  handleError,
                )
                ?.then(() => {
                  if (isMounted) setIsLoading(false);
                })
                .catch((err: any) => {
                  if (!isMounted) return;
                  setIsLoading(false);
                  const errText = err?.message || String(err);
                  if (/permission|notallowed|denied/i.test(errText)) {
                    setErrorMessage(
                      "Camera access was blocked. Please grant camera permission in your browser settings.",
                    );
                  } else {
                    setErrorMessage(
                      "Unable to access camera feed. Please verify camera permissions.",
                    );
                  }
                });
            });
        } else {
          setIsLoading(false);
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage("Scanner initialization error.");
    }

    return () => {
      isMounted = false;
      if (currentScanner) {
        try {
          if (currentScanner.isScanning && currentScanner.stop) {
            currentScanner
              .stop()
              .then(() => {
                currentScanner?.clear?.();
              })
              .catch(() => {});
          } else if (currentScanner.clear) {
            currentScanner.clear().catch?.(() => {});
          }
        } catch {}
      }
    };
  }, [selectedCameraId, retryCount]);

  return (
    <div className="w-full max-w-md mx-auto relative">
      {/* Camera device switcher if multiple cameras available */}
      {cameras.length > 1 && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor="scanner-camera-select" className="font-label text-xs font-semibold text-text-grey">
            Camera:
          </label>
          <select
            id="scanner-camera-select"
            value={selectedCameraId ?? ""}
            onChange={(e) => setSelectedCameraId(e.target.value)}
            className="rounded border border-outline-variant/60 bg-surface-white px-2 py-1 font-body text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-navy"
          >
            {cameras.map((cam, idx) => (
              <option key={cam.id} value={cam.id}>
                {cam.label || `Camera ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Loading state indicator */}
      {isLoading && (
        <div className="flex h-48 w-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
          <RefreshCw className="h-6 w-6 animate-spin text-brand-navy" />
          <p className="mt-2 font-heading text-xs font-semibold text-on-surface">
            Starting camera stream...
          </p>
        </div>
      )}

      {/* Error state */}
      {errorMessage && !isLoading && (
        <div className="flex h-48 w-full flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-center">
          <AlertCircle className="h-7 w-7 text-status-held" />
          <p className="mt-1.5 font-heading text-xs font-bold text-status-held">
            Camera Unavailable
          </p>
          <p className="mt-1 font-body text-xs text-text-grey max-w-xs">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => setRetryCount((c) => c + 1)}
            className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-brand-navy px-3 py-1 font-label text-xs font-bold text-surface-white hover:bg-brand-navy/90"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* Scanner container for html5-qrcode */}
      <div
        id="html5qr-code-full-region"
        className={`w-full bg-surface-white shadow-elevation-2 rounded-xl overflow-hidden ${isLoading || errorMessage ? "hidden" : "block"}`}
      />
    </div>
  );
}
