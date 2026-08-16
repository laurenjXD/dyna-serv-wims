# Barcode & QR Integration — Design

Status: Approved
Updated: 2026-08-10

Cites foundational specs:
- `specs/00-steering/tech.md`
- `specs/00-steering/ui-ux-design-plan.md`
- `specs/01-core-data-model/requirements.md`
- `specs/22-parties-portal/requirements.md` R11 and `design.md` §7c for the scoped `WAN:<uuid>` exception

## 1. Frontend Architecture: Mobile Camera Scanner

Because the system operates strictly on mobile devices without physical laser scanners, the entire scanning engine relies on HTML5 camera access.

### 1.1 `<MobileQRScanner>` Component
We will utilize the `html5-qrcode` library, which is highly optimized for mobile browsers.

```typescript
// Conceptual Component Architecture
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect, useRef } from 'react';

export function MobileQRScanner({ onScanSuccess, onScanError }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    // Configure scanner to prefer rear camera. Ordinary contexts remain 2D-only;
    // the R11 route adds Code 128 and accepts only the WAN:<uuid> prefix.
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      formatsToSupport: isInboundAdvanceNotice
        ? [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128]
        : [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.DATA_MATRIX]
    };

    const scanner = new Html5QrcodeScanner("reader", config, false);
    
    scanner.render(
      (decodedText) => {
        // Pause scanning to prevent rapid double-fires
        scanner.pause();
        onScanSuccess(decodedText);
      },
      (errorMessage) => {
        onScanError(errorMessage);
      }
    );

    scannerRef.current = scanner;

    return () => {
      scanner.clear();
    };
  }, []);

  return <div id="reader" className="w-full max-w-md mx-auto rounded-lg overflow-hidden border-2 border-brand-navy" />;
}
```

### 1.2 Feedback Mechanisms
Per `ui-ux-design-plan.md`, every floor scan requires immediate feedback. 
- **Visual:** A `<ScanFeedbackProvider>` globally overlays a `div` with absolute positioning, firing a 300ms CSS opacity transition (`bg-status-available` for success, `bg-status-held` for error).
- **Audio:** The browser's Web Audio API will be used to synthesize a short 800Hz beep (100ms duration) on successful decodes, since the device lacks a hardware beeper.

## 2. QR Code Payload Design

When Dyna-Serv needs to generate its own labels for unknown/unbarcoded items arriving at the receiving dock, we will generate QR codes containing JSON.

**Preferred Internal Payload (UUID Lookup):**
```json
{
  "dsw_id": "a1b2c3d4-..." // UUID mapped to the `lots` table
}
```

*Note on performance:* Keeping the payload small (a single UUID rather than a massive JSON string) ensures the QR code matrix is physically less dense. A low-density 2D matrix dramatically increases the mobile camera's read-speed and reliability under poor warehouse lighting.

**Scoped R11 exception:** `22-parties-portal` uses the flat `WAN:<uuid>` payload
for a supplier-initiated inbound advance notice. The scanner must accept
Code 128 on that route only, validate the `WAN:` prefix and UUID shape, and
resolve the UUID to `wrr_advance_notices.id`; it must not reinterpret ordinary
Code 128/UPC values as lot or item payloads in any other workflow.

### 2.1 QR Generation Component
- **Library:** `react-qr-code` or `qrcode.react`.
- Rendered in the browser and passed to the print driver when an Admin clicks "Print Label" on the Enrollment UI.

### 2.2 WRR-time per-unit label generation (added 2026-08-10)

**Distinct from §2.1.** §2.1's "Print Label" flow generates one label for one already-enrolled lot/item, at enrollment time. This subsection covers a different case: some vendors' cartons arrive without usable/trusted barcodes at all, and the label needs to exist **before** anything is scanned — at `07-incoming-receiving` WRR creation/staging time, per WRR line, not per lot (no lot exists yet at staging; see `07` design.md §1's expectation/inventory boundary).

**What is generated.** For a given `wrr_items` line, the system MAY generate and print `N` labels, where `N = wrr_items.expected_qty`. All `N` labels share the same underlying item identity (the line's resolved `item_id`/item code), but **each carries its own unique per-unit identifier** — e.g. a sequence number or a UUID suffixed to the item code — never `N` identical bare-item-code labels.

**Why unique-per-label, not identical-per-line.** `07-incoming-receiving` design.md §6 already requires rejecting duplicate and over-quantity scans as part of its reconciliation matcher. If every physical label printed for a line carried the exact same payload, the system would have no way to distinguish "this exact physical label was scanned a second time" (a duplicate that must be rejected) from "a second, different physical unit on the same line was scanned" (a legitimate additional unit toward `expected_qty`) — it would only ever see the same string twice and have to fall back to a fuzzy running-count comparison. A unique-per-label payload makes duplicate detection exact (the specific label identifier was already recorded) instead of approximate. This is the same reasoning already applied elsewhere in this project's design for unique-per-artifact identifiers: `22-parties-portal`'s `WAN:<uuid>` advance-notice labels (§2, above — one unique identifier per advance notice, not a shared item-level code); `14-notifications-and-alerts`'s `(event_id, recipient_id, channel, template_version)` idempotency key (uniquely identifies one delivery attempt, not just "this notification type"); and `10-pick-list-and-acknowledgement-receipt`'s `generated_documents.snapshot_hash` (uniquely identifies one generated artifact's content, not just "a pick list").

**Payload shape.** Follows this document's §2 convention (a small payload favoring a UUID lookup over a large embedded blob) rather than the flat `WAN:<uuid>` string used by §2's Scoped R11 exception, because this payload needs to carry two identities — the shared item reference and the unique per-unit identifier — not one:

```json
{
  "type": "wrr_item_unit",
  "wrr_item_id": "uuid",   // the wrr_items line this unit belongs to
  "unit_id": "uuid"        // unique per physical label, distinct per unit
}
```

`wrr_item_id` is the lookup key into the expected line (item, expected quantity, UOM, lot number, disposition — all already defined by `07-incoming-receiving` design.md §5.1); `unit_id` is the value that must never repeat across the `N` labels printed for that line, and is what `07`'s scan matcher records to detect an exact duplicate-label rescan versus a legitimately distinct unit. This is keyed to the WRR line/item, not to `dsw_id` or a `lots` UUID (per §2's `dsw_id` convention) or to a `wrr_advance_notices` row (per the Scoped R11 exception's `WAN:<uuid>`) — no lot exists yet at WRR-line time, and this is not an advance-notice submission.

**Ownership boundary.** Generation and printing of these labels is triggered from `07-incoming-receiving`'s WRR creation/staging surface (an office pre-receiving action, per `07` design.md §1), reusing this spec's own §2.1 QR-generation component and print driver rather than a second one. `07` owns when/whether to trigger generation for a given line (e.g. a vendor known to ship without reliable barcodes); this spec owns the label component, payload shape, and print rendering. Scanning one of these labels at the receiving bay resolves through `07`'s existing barcode-reconciliation matcher (`07` design.md §6) exactly as any other 2D payload does — no new scan-time code path, only a new payload shape the matcher recognizes by its `type` discriminator.
