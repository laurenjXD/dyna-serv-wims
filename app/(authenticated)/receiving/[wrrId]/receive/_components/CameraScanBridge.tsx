"use client";

// Bridges ReceivingCameraScanner's client-side onScanSubmitted callback into
// the page's existing Server Action ("use server" functions are serializable
// references and can be passed as props into a Client Component). Submits a
// hidden form bound to that same action, so a camera-decoded scan goes
// through the identical recordScan pipeline as the manual keyboard-scanner
// input — a second input method, not a parallel path.
//
// Traceability: specs/18-barcode-integration/design.md §1 (Mobile Camera
// Scanner), specs/07-incoming-receiving/design.md §6 (floor scan design).

import { useRef } from "react";
import { ReceivingCameraScanner } from "./ReceivingCameraScanner";

export function CameraScanBridge({
  action,
}: {
  action: (formData: FormData) => void;
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
      </form>
      <ReceivingCameraScanner onScanSubmitted={handleScanSubmitted} />
    </div>
  );
}
