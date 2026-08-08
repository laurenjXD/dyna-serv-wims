// @vitest-environment jsdom
//
// RED-step tests for `components/barcode/LabelPrinter.tsx`, which does not
// exist yet.
//
// Traceability:
//   specs/18-barcode-integration/requirements.md
//     AC-3  — System generates a downloadable/printable 2D QR code payload
//             for an unknown item during the Receiving flow
//     FR-3.1 — Provide functionality to generate and print 2D QR Code labels
//     FR-3.2 — QR payload is { "dsw_id": "<uuid>" } — UUID lookup, not a
//              data blob. The encoded value is EXACTLY the UUID string.
//
//   specs/18-barcode-integration/design.md §2 and §2.1:
//     Preferred internal payload: { "dsw_id": "a1b2c3d4-..." }
//     Library: react-qr-code (or qrcode.react).
//     Rendered in browser; Admin clicks "Print Label" to invoke print driver.
//
// Component contract being tested (implementation does NOT exist yet):
//
//   export function LabelPrinter(props: {
//     lotId: string;       // UUID — the dsw_id payload encoded into the QR
//     lotNumber: string;   // human-readable label text
//     itemCode: string;
//     locationLabel?: string;
//   }): JSX.Element
//
// `react-qr-code` is mocked so the test does not require a canvas/SVG
// rendering environment. The mock renders a div with data-testid="qr-code"
// and data-value={props.value}, making assertions deterministic.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelPrinter } from "@/components/barcode/LabelPrinter";

// ---------------------------------------------------------------------------
// react-qr-code mock
// ---------------------------------------------------------------------------

vi.mock("react-qr-code", () => {
  const QRCode = ({ value }: { value: string }) => (
    <div data-testid="qr-code" data-value={value} />
  );
  QRCode.displayName = "QRCode";
  return { default: QRCode };
});

// ---------------------------------------------------------------------------
// window.print mock
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LabelPrinter (specs/18-barcode-integration FR-3.1, FR-3.2, AC-3)", () => {
  const LOT_ID = "a1b2c3d4-1111-2222-3333-444444444444";
  const LOT_NUMBER = "LOT-2026-001";
  const ITEM_CODE = "ITEM-ABC";
  const LOCATION_LABEL = "Rack A-01";

  // -------------------------------------------------------------------------
  // FR-3.1 — Renders a QR code element with the correct lotId value
  // -------------------------------------------------------------------------
  it("FR-3.1 / AC-3: renders a QR code element (react-qr-code mock present with data-testid)", () => {
    render(
      <LabelPrinter
        lotId={LOT_ID}
        lotNumber={LOT_NUMBER}
        itemCode={ITEM_CODE}
      />,
    );

    const qrCode = screen.getByTestId("qr-code");
    expect(qrCode).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // FR-3.2 — QR value is exactly the UUID string (the lotId), not prefixed
  // -------------------------------------------------------------------------
  it("FR-3.2: the QR code value is exactly the lotId UUID string — not prefixed or transformed (design.md §2)", () => {
    render(
      <LabelPrinter
        lotId={LOT_ID}
        lotNumber={LOT_NUMBER}
        itemCode={ITEM_CODE}
      />,
    );

    const qrCode = screen.getByTestId("qr-code");
    // The QR value must be the raw UUID passed as lotId. The spec is explicit:
    // the payload is { "dsw_id": "<uuid>" } but the component encodes it as
    // just the UUID string (design.md §2 calls it a "UUID lookup" payload).
    // The value attribute on our mock div reflects the raw `value` prop.
    expect(qrCode.getAttribute("data-value")).toBe(LOT_ID);
  });

  // -------------------------------------------------------------------------
  // FR-3.1 — lotNumber and itemCode appear as visible human-readable text
  // -------------------------------------------------------------------------
  it("FR-3.1: displays lotNumber as visible text on the label", () => {
    render(
      <LabelPrinter
        lotId={LOT_ID}
        lotNumber={LOT_NUMBER}
        itemCode={ITEM_CODE}
      />,
    );

    expect(screen.getByText(LOT_NUMBER)).toBeDefined();
  });

  it("FR-3.1: displays itemCode as visible text on the label", () => {
    render(
      <LabelPrinter
        lotId={LOT_ID}
        lotNumber={LOT_NUMBER}
        itemCode={ITEM_CODE}
      />,
    );

    expect(screen.getByText(ITEM_CODE)).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // AC-3 — Print button invokes window.print()
  // -------------------------------------------------------------------------
  it("AC-3: calls window.print() when the print button is clicked (design.md §2.1: Admin clicks Print Label)", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    render(
      <LabelPrinter
        lotId={LOT_ID}
        lotNumber={LOT_NUMBER}
        itemCode={ITEM_CODE}
        locationLabel={LOCATION_LABEL}
      />,
    );

    const printButton = screen.getByRole("button", { name: /print/i });
    await userEvent.click(printButton);

    expect(printSpy).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // FR-3.2 — QR value is exactly the lotId UUID — not prefixed or transformed
  // (repeated as an explicit naming-contract test separate from the render test)
  // -------------------------------------------------------------------------
  it("FR-3.2: QR value equals lotId exactly — not 'lot:<uuid>' or any other prefix (design.md §2 payload is the UUID itself)", () => {
    render(
      <LabelPrinter
        lotId={LOT_ID}
        lotNumber={LOT_NUMBER}
        itemCode={ITEM_CODE}
      />,
    );

    const qrCode = screen.getByTestId("qr-code");
    const qrValue = qrCode.getAttribute("data-value") ?? "";

    // Must be exactly the UUID — no prefix, no suffix, no JSON wrapping.
    expect(qrValue).toBe(LOT_ID);
    expect(qrValue).not.toMatch(/^lot:/i);
    expect(qrValue).not.toMatch(/^\{/); // not JSON
    expect(qrValue).not.toMatch(/^WAN:/i);
  });
});
