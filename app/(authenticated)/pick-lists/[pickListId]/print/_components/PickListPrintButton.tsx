"use client";

export function PickListPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center justify-center rounded bg-primary px-4 font-label text-label font-bold text-surface-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
    >
      Print / Save PDF
    </button>
  );
}
