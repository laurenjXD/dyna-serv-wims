"use client";

// specs/18-barcode-integration FR-1, FR-2, FR-2.3, AC-1, AC-2, AC-4
// Floor surface component — direct rear-camera stream with graceful fallback to any available camera.

import { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import { RefreshCw, AlertCircle, Camera, Check } from "lucide-react";
import { useScannerSettings } from "./ScannerSettingsProvider";

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
  getRunningTrackCameraCapabilities?: () => {
    torchFeature?: () => { isSupported: () => boolean };
  };
  applyVideoConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
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
  const scannerSettings = useScannerSettings();

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

    const formatsToSupport = [
      ...(scannerSettings.symbologies.qrCode ? [Html5QrcodeSupportedFormats.QR_CODE] : []),
      ...(scannerSettings.symbologies.dataMatrix ? [Html5QrcodeSupportedFormats.DATA_MATRIX] : []),
      ...(allowCode128Ref.current && scannerSettings.symbologies.code128
        ? [Html5QrcodeSupportedFormats.CODE_128]
        : []),
    ];

    const scannerConfig = {
      fps: 15,
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

      // The workflow pauses after every accepted decode to prevent duplicate
      // physical scans. `continuousStream` remains an admin preference for
      // future scanner hardware that can resume explicitly; it must not weaken
      // this approved duplicate-protection contract.
      if (currentScanner?.pause) {
        currentScanner.pause();
      }
      if (scannerSettings.hapticFeedback && typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(80);
      }
      if (scannerSettings.audioAlertTone) {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const context = new AudioCtx();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 800;
            gain.gain.setValueAtTime(0.15, context.currentTime);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.1);
          }
        } catch {
          // Optional feedback must never block scan acceptance.
        }
      }
      onScanRef.current(decodedText);
    };

    const handleError = (_errorMessage: string) => {
      // Ignore normal per-frame non-matches
    };

    async function initAndStart() {
      try {
        const scannerInstance = createScanner(elementId, {
          formatsToSupport,
          verbose: false,
        });

        if (!scannerInstance) {
          if (isMounted) {
            setIsLoading(false);
            setErrorMessage("Scanner library could not be instantiated.");
          }
          return;
        }

        currentScanner = scannerInstance;

        if (typeof scannerInstance.render === "function") {
          scannerInstance.render(handleSuccess, handleError);
          if (isMounted) setIsLoading(false);
          return;
        }

        if (typeof scannerInstance.start !== "function") {
          if (isMounted) setIsLoading(false);
          return;
        }

        // 1. Determine camera device to use
        let targetCamera: string | object = selectedCameraId
          ? selectedCameraId
          : { facingMode: "environment" };

        if (!selectedCameraId && typeof Html5Qrcode.getCameras === "function") {
          try {
            const rawDevices = await Html5Qrcode.getCameras();
            if (rawDevices && rawDevices.length > 0) {
              const deviceList = rawDevices.map((d) => ({
                id: d.id,
                label: d.label || `Camera ${d.id.slice(0, 5)}`,
              }));
              if (isMounted) setCameras(deviceList);

              const rearCam = deviceList.find((c) =>
                /back|rear|environment|facing\s*back/i.test(c.label),
              );
              targetCamera = rearCam ? rearCam.id : deviceList[0].id;
            }
          } catch {
            // Enumeration failed — keep facingMode constraint
          }
        }

        if (!isMounted) return;

        // 2. Start video stream
        try {
          await scannerInstance.start(
            targetCamera,
            scannerConfig,
            handleSuccess,
            handleError,
          );
          await applyCameraPreferences(scannerInstance);
          if (isMounted) {
            setIsLoading(false);
            setErrorMessage(null);
          }
        } catch {
          if (!isMounted) return;
          // Fallback to user facing camera / webcam
          try {
            await scannerInstance.start(
              { facingMode: "user" },
              scannerConfig,
              handleSuccess,
              handleError,
            );
            await applyCameraPreferences(scannerInstance);
            if (isMounted) {
              setIsLoading(false);
              setErrorMessage(null);
            }
          } catch (fallbackErr: unknown) {
            if (!isMounted) return;
            setIsLoading(false);
            const errText = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            if (/permission|notallowed|denied/i.test(errText)) {
              setErrorMessage(
                "Camera permission was blocked. Please allow camera access in your browser and tap Retry.",
              );
            } else if (/secure|https|insecure/i.test(errText)) {
              setErrorMessage(
                "Camera access requires a secure connection (HTTPS) or localhost.",
              );
            } else if (/notfound|overconstrained|no camera/i.test(errText)) {
              setErrorMessage(
                "No camera device was detected on this device.",
              );
            } else {
              setErrorMessage(
                "Could not start video stream. Please check camera permissions and tap Retry.",
              );
            }
          }
        }
      } catch {
        if (!isMounted) return;
        setIsLoading(false);
        setErrorMessage("Scanner initialization error.");
      }
    }

    async function applyCameraPreferences(scannerInstance: ScannerInstance) {
      if (!scannerInstance.applyVideoConstraints) return;

      // Camera capabilities are device/browser-specific. Apply each optional
      // preference only when the active track advertises support; a rejected
      // optional constraint must never prevent barcode scanning.
      if (scannerSettings.torchDefault) {
        try {
          const capabilities = scannerInstance.getRunningTrackCameraCapabilities?.();
          if (capabilities?.torchFeature?.().isSupported()) {
            await scannerInstance.applyVideoConstraints({
              advanced: [{ torch: true }],
            } as unknown as MediaTrackConstraints);
          }
        } catch {
          // Torch is an enhancement, not a scanner prerequisite.
        }
      }

      if (scannerSettings.tapToFocus) {
        try {
          await scannerInstance.applyVideoConstraints({
            advanced: [{ focusMode: "continuous" }],
          } as unknown as MediaTrackConstraints);
        } catch {
          // Focus mode is not available on every browser/camera combination.
        }
      }
    }

    initAndStart();

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
    <div className="w-full max-w-md mx-auto">
      <style>{`
        #html5qr-code-full-region {
          border: none !important;
        }
        #html5qr-code-full-region video {
          width: 100% !important;
          max-height: 320px !important;
          object-fit: cover !important;
          border-radius: 0.75rem !important;
        }
        #html5qr-code-full-region img {
          display: none !important;
        }
        #html5qr-code-full-region__scan_region {
          min-height: 240px;
        }
      `}</style>

      {/* Camera device switcher if multiple cameras available */}
      {cameras.length > 1 && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor="scanner-camera-select" className="font-label text-xs font-semibold text-text-grey flex items-center gap-1">
            <Camera size={13} /> Camera source:
          </label>
          <select
            id="scanner-camera-select"
            value={selectedCameraId ?? ""}
            onChange={(e) => setSelectedCameraId(e.target.value)}
            className="rounded-lg border border-outline-variant/60 bg-surface-white px-2 py-1 font-body text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-navy"
          >
            {cameras.map((cam, idx) => (
              <option key={cam.id} value={cam.id}>
                {cam.label || `Camera ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Relative container holding scanner element and overlay */}
      <div className="relative min-h-[280px] w-full overflow-hidden rounded-2xl bg-slate-900 shadow-elevation-2">
        {/* The scanner element is ALWAYS in the DOM so html5-qrcode can measure dimensions */}
        <div id={elementId} className="w-full" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/85 p-4 text-center text-white backdrop-blur-xs">
            <RefreshCw className="h-7 w-7 animate-spin text-blue-400" />
            <p className="mt-3 font-heading text-sm font-semibold">
              Connecting camera stream...
            </p>
            <p className="mt-1 font-body text-xs text-slate-300">
              Please grant camera permission in your browser if prompted.
            </p>
          </div>
        )}

        {/* Error overlay */}
        {errorMessage && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/95 p-5 text-center text-white">
            <AlertCircle className="h-8 w-8 text-rose-400" />
            <p className="mt-2 font-heading text-sm font-bold text-rose-300">
              Camera Access Required
            </p>
            <p className="mt-1 font-body text-xs text-slate-300 max-w-xs">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 font-label text-xs font-bold text-white shadow hover:bg-blue-500 active:scale-95 transition-all"
            >
              <RefreshCw size={14} /> Retry Camera
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
