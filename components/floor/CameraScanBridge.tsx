"use client";

// Bridges FloorCameraScanner's client-side onScanSubmitted callback into a
// Server Action. Submits a hidden form so a camera-decoded barcode goes
// through the exact same Server Action pipeline as the manual keyboard input —
// a second input method, not a parallel path.
//
// Traceability: specs/18-barcode-integration design.md §1 (Mobile Camera Scanner)
// Used by: receiving floor scan page, pick floor scan page.

import { useRef } from "react";
import { FloorCameraScanner } from "./FloorCameraScanner";

export function CameraScanBridge({
  action,
  extraFields,
}: {
  action: (formData: FormData) => void;
  /** Additional hidden fields to include in the submitted form (e.g. confirmed picks). */
  extraFields?: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleScanSubmitted(barcode: string) {
    if (inputRef.current) {
      inputRef.current.value = barcode;
    }
    formRef.current?.requestSubmit();
  }

  return (
    <div>
      <form ref={formRef} action={action}>
        <input ref={inputRef} type="hidden" name="barcode" />
        {extraFields &&
          Object.entries(extraFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
      </form>
      <FloorCameraScanner onScanSubmitted={handleScanSubmitted} />
    </div>
  );
}
