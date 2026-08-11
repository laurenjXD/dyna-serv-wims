"use client";

// Bridges a plain client-side scan callback (ReceivingCameraScanner's
// `onScanSubmitted: (barcode: string) => void`) into an existing Server
// Action bound to a <form> (`handleScan` on receive/page.tsx) — the same
// pipeline the manual keyboard-scanner-input form already submits through.
//
// Why this exists: `ReceivingCameraScanner` is a plain "use client" component
// with a synchronous callback prop, not a form. `handleScan` is a Server
// Action, which can only be invoked via `<form action={...}>` submission (or
// direct-invocation, for which this codebase has no established precedent —
// see receive/page.tsx's Task A comment). This component owns the hidden
// form + refs needed to programmatically submit that action on a decoded
// scan, so `receive/page.tsx` (a Server Component) never needs client-side
// state of its own.
//
// Server/client boundary note: the `ReceivingCameraScanner` element passed
// as `children` is constructed in the Server Component (receive/page.tsx)
// without a live `onScanSubmitted` function reference (a non-Server-Action
// function cannot cross the RSC serialization boundary as a prop). This
// component injects the real, client-side callback via `cloneElement` before
// rendering — a supported pattern for handing client interactivity to a
// Server Component-authored child element. This substitution happens
// synchronously during render, before any scan event can possibly fire, so
// there is no window where the placeholder value would be invoked.
//
// Traceability:
//   specs/18-barcode-integration/requirements.md FR-1.1, AC-2
//   specs/07-incoming-receiving/design.md §6 (floor scan design)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules — the
//     manual barcode input remains the sole primary/auto-focused action;
//     this camera path is a secondary/alternate entry point feeding the
//     identical recordScan pipeline, not a parallel one)
//
// Tier: this introduces no new offline surface. It submits through the exact
// same `handleScan` Server Action (online-only, Tier 2 per
// specs/07-incoming-receiving/requirements.md) that the manual input already
// uses — see the note on `recordScan` in
// docs/superpowers/plans/2026-08-11-barcode-scanner-and-unit-labels-completion.md.

import {
  cloneElement,
  isValidElement,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";

interface ScannerChildProps {
  onScanSubmitted?: (barcode: string) => void;
}

interface CameraScanBridgeProps {
  /** The existing Server Action (e.g. `handleScan`) to submit through — same
   * pipeline the manual barcode-input form already uses. */
  action: (formData: FormData) => void | Promise<void>;
  /** Expected to be a single `<ReceivingCameraScanner />` element. Its
   * `onScanSubmitted` prop is overridden client-side regardless of what (if
   * anything) was passed to it in the Server Component. */
  children: ReactNode;
}

export function CameraScanBridge({ action, children }: CameraScanBridgeProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleScanSubmitted(barcode: string) {
    if (inputRef.current) {
      inputRef.current.value = barcode;
    }
    formRef.current?.requestSubmit();
  }

  const scannerElement = isValidElement(children)
    ? cloneElement(children as ReactElement<ScannerChildProps>, {
        onScanSubmitted: handleScanSubmitted,
      })
    : children;

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="barcode" ref={inputRef} />
      {scannerElement}
    </form>
  );
}
