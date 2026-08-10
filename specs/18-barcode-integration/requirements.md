# Barcode & QR Integration — Requirements

Status: Approved
Updated: 2026-08-10

Depends on:
- `specs/00-steering/tech.md`
- `specs/00-steering/brand-design-system.md`
- `specs/01-core-data-model/requirements.md`

## 1. Overview

This module defines the architecture for 2D barcode (QR code) scanning and generation, with one narrowly-scoped 1D/Code 128 decoding exception owned by `22-parties-portal` R11.
The warehouse floor operations are executed strictly on **mobile devices** using their native cameras. We do not use rugged hardware laser scanners or "keyboard wedges". All scanning is performed via a software-based camera interface.

## 2. Goals
- Provide a robust software-based camera scanner optimized for mobile devices.
- Support 2D barcodes (QR Codes/Data Matrix) for all ordinary warehouse payloads, plus the flat `WAN:<uuid>` Code 128 exception defined in FR-2.3.
- Define a standard QR code payload structure for internally generated labels.
- Supply a centralized scanning component that Specs 07 (Receiving) and 08 (Picking) can inherit.

## 3. Functional Requirements

### FR-1: Mobile Camera Scanning
1. Every scan-enabled floor screen SHALL provide a distinct UI button (e.g., a massive 64x64px camera icon) to activate the mobile camera scanner.
2. The scanner SHALL request necessary browser video permissions and render a live feed from the device's rear-facing camera.
3. The scanner SHALL process the video feed in real-time to detect and decode 2D barcodes. Where FR-2.3 applies, the same scan component SHALL also be capable of decoding a 1D/linear (Code 128) barcode — standard camera-decode libraries typically support both formats natively, so this is a scanning-library capability question, not a new hardware requirement.

### FR-2: Supported Formats (2D Only, with one scoped exception)
1. The system SHALL strictly support parsing **2D Barcodes** (QR Codes, Data Matrix) for every scanning context except the FR-2.3 exception below.
2. 1D barcodes (e.g., Code 128, UPC) are deprecated in every other workflow as they cannot hold the complex JSON payloads required for VMI/Trading lot identification. This restriction does not apply to the flat `WAN:<uuid>` payload in FR-2.3.

### FR-2.3: 1D/Linear Barcode Exception — Supplier-Initiated Inbound Pre-Label Flow

1D/linear barcode (Code 128) decoding SHALL be supported specifically for the supplier-initiated inbound pre-label flow defined in `22-parties-portal` requirements.md R11, where the payload is a flat string identifier (`WAN:<uuid>`, referencing a `wrr_advance_notices` row — not a `lots` UUID) rather than a JSON blob. This is exactly the data-capacity reason FR-2.2 excludes 1D elsewhere — since this payload was never JSON, that reason does not apply here. This is the sole exception to FR-2.1/FR-2.2. Every other scanning context in this system — WRR barcode reconciliation for internally-generated labels (FR-3), pick-list scanning, and item/lot identification — remains 2D/QR-only exactly as FR-2.1/FR-2.2 already specify.

### FR-3: Label Generation (QR)
1. The system SHALL provide functionality to generate and print 2D QR Code labels for items that arrive without scannable QR codes.
2. The generated QR payload SHALL be structured securely, favoring a UUID lookup (`{"type": "lot", "id": "uuid"}`) rather than massive unencrypted data blobs.

### FR-3a: WRR-time per-unit label generation (added 2026-08-10)

1. WHEN a back-office user is staging a `07-incoming-receiving` WRR line for a vendor whose cartons arrive without usable/trusted barcodes, THE SYSTEM SHALL be able to generate and print `N` labels for that line, where `N` equals the line's expected quantity, SO THAT every physical unit can be scanned on the floor even though the vendor supplied no reliable barcode.
2. Every one of the `N` labels for a line SHALL share the same underlying item identity but SHALL carry its own unique per-unit identifier (e.g. a sequence number or UUID suffix); THE SYSTEM SHALL NOT print `N` labels carrying an identical payload for the same line.
3. WHEN a physical label from this flow is scanned at the receiving bay, THE SYSTEM SHALL resolve it to its owning `wrr_items` line and treat a repeat scan of the exact same unique per-unit identifier as a duplicate-scan rejection (per `07-incoming-receiving` requirements.md R3.3), SO THAT a duplicate physical rescan cannot be silently counted as a second, distinct unit before the expected quantity is reached.
4. This label type is distinct from FR-3's per-lot/per-item "Print Label" flow: it is generated at WRR-line staging time, before any lot exists, keyed to the WRR line and item — not to a `dsw_id` or `lots` UUID.

## 5a. Out of Scope (WRR-time per-unit labels)
- Generating per-unit labels for every WRR line by default; this remains a deliberate action for lines where the vendor's own barcode is not usable/trusted.
- Any change to FR-3's existing per-lot/per-item "Print Label" flow.

## 4. Non-Functional Requirements & UX
1. **Visual Feedback:** As mandated by `brand-design-system.md`, every successful scan MUST trigger a full-screen color flash (Green for success, Red for failure).
2. **Auditory Feedback:** Upon a successful camera decode, the web application SHALL trigger a short, distinct audio beep to simulate hardware scanner feedback.
3. **Environment:** The camera scanner MUST support a "torch" (flashlight) toggle if the mobile device's API permits it, to handle poorly lit warehouse aisles.

## 5. Out of Scope
- Integration with external Bluetooth/Serial hardware scanners.
- "Keyboard wedge" input interception.
- 1D barcode parsing outside the FR-2.3 exception for `22` R11.

## 6. Acceptance Criteria
1. A user on a mobile device can tap the "Scan" button, grant camera permissions, and the live camera feed appears.
2. The camera successfully decodes a 2D QR code, plays an audio beep, flashes the screen green, and passes the payload to the active workflow.
3. The system successfully generates a downloadable/printable 2D QR code payload for an unknown item during the Receiving flow.
4. The system decodes a 1D/Code 128 barcode specifically for the `22` R11 supplier-initiated inbound pre-label flow (resolving a `WAN:<uuid>` payload), and continues rejecting/ignoring 1D barcodes in every other scanning context.
5. **Added 2026-08-10:** for a `07-incoming-receiving` WRR line staged with per-unit label generation, the system prints `N` (= expected quantity) 2D labels sharing one item identity but each with a distinct unique per-unit identifier; scanning the same physical label twice is rejected as a duplicate, while scanning two different labels from the same line is accepted toward the expected quantity.
