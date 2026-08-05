# Barcode & QR Integration — Requirements

Status: Draft

Depends on:
- `specs/00-steering/tech.md`
- `specs/00-steering/brand-design-system.md`
- `specs/01-core-data-model/requirements.md`

## 1. Overview

This module centralizes the architecture for barcode scanning and QR code generation. 
Because the warehouse floor relies on rugged Android scanners (e.g., Zebra, Honeywell) that function as "keyboard wedges," the web application must intelligently intercept rapid keystrokes globally without requiring the user to tap an input field first.

## 2. Goals
- Provide a seamless, input-agnostic scanning experience on floor devices.
- Define a standard QR code payload structure for internally generated labels.
- Provide a software-based camera scanner fallback for when physical lasers fail.
- Supply a centralized scanning architecture that Specs 07 (Receiving) and 08 (Picking) can inherit.

## 3. Functional Requirements

### FR-1: Hardware Keyboard Wedge Interception
1. The system SHALL listen globally for rapid keystroke events characteristic of hardware laser scanners (e.g., detecting input faster than ~30ms per character followed by an `Enter` keycode).
2. Upon intercepting a scan, the system SHALL suppress the default keyboard input behavior to prevent focus-stealing or accidental form submission.
3. The intercepted barcode string SHALL be passed to a centralized handler context that routes the data to the active floor workflow (e.g., Receiving vs Picking).

### FR-2: Supported Formats
1. **1D Barcodes:** The system SHALL support parsing standard 1D barcodes (e.g., Code 128, EAN-13) typically used for basic `item_code` lookups.
2. **2D QR Codes:** The system SHALL support parsing 2D QR codes containing JSON payloads or delineated strings for complex lookups (e.g., embedding both `item_code` and `vendor_lot_number`).

### FR-3: Software Camera Fallback
1. Every scan-enabled floor screen SHALL provide a distinct UI button (e.g., a camera icon) to activate a software-based camera scanner.
2. The camera scanner SHALL request necessary browser permissions and render a live feed from the device's rear-facing camera.
3. Upon successfully decoding a barcode/QR via the camera, the system SHALL emit the exact same event payload as the hardware keyboard wedge.

### FR-4: Label Generation (QR)
1. The system SHALL provide functionality to generate and print 2D QR Code labels for items that arrive without scannable barcodes.
2. The generated QR payload SHALL be structured securely, favoring a UUID lookup (`{"type": "lot", "id": "uuid"}`) rather than massive unencrypted data blobs.

## 4. Non-Functional Requirements & UX
1. **Auditory & Visual Feedback:** As mandated by `brand-design-system.md`, every successful scan MUST trigger a full-screen color flash (Green for success, Red for failure). The scanner hardware's native "beep" is sufficient for auditory feedback; the web app should not attempt to play conflicting audio.
2. **Speed:** The global interceptor MUST process the barcode string in under 100ms to ensure the warehouse worker can continuously scan without bottlenecking.

## 5. Out of Scope
- Direct integration with Bluetooth/Serial hardware APIs (Web Serial API). We rely strictly on the standard keyboard wedge abstraction provided by the Android OS.
- Designing the physical layout of the printed adhesive labels (this is an operational/printer configuration task).

## 6. Acceptance Criteria
1. A user can trigger a hardware scan on a rugged device, and the app correctly intercepts the full string without requiring an HTML `<input>` to be focused.
2. A user can tap the "Camera" icon and successfully scan a Code 128 barcode using their mobile phone's rear camera.
3. The system successfully generates a downloadable/printable QR code payload for an unknown item during the Receiving flow.
