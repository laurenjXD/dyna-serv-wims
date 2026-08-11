"use client";

// Client-boundary wrapper for the print trigger. Extracted out of the
// (Server Component) print page — a native <button onClick> cannot live
// directly inside a Server Component's JSX in the Next.js App Router; this
// mirrors the established pattern already used for other interactive floor/
// office fragments in this codebase (see components/barcode/
// WRRUnitLabelGenerator.tsx, also a small "use client" leaf embedded inside
// a Server Component page).

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-11 items-center justify-center rounded bg-brand-red px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
    >
      Print
    </button>
  );
}
