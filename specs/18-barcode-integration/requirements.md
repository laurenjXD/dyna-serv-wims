# Barcode & QR Integration — Requirements

Status: Draft

Depends on:
- `specs/00-steering/tech.md`
- `specs/00-steering/brand-design-system.md`
- `specs/01-core-data-model/requirements.md`

## 1. Overview

This module defines the architecture for 2D barcode (QR code) scanning and generation. 
The warehouse floor operations are executed strictly on **mobile devices** using their native cameras. We do not use rugged hardware laser scanners or "keyboard wedges". All scanning is performed via a software-based camera interface.

## 2. Goals
- Provide a robust software-based camera scanner optimized for mobile devices.
- Support strictly 2D barcodes (QR Codes) for high-density data payloads.
- Define a standard QR code payload structure for internally generated labels.
- Supply a centralized scanning component that Specs 07 (Receiving) and 08 (Picking) can inherit.

## 3. Functional Requirements

### FR-1: Mobile Camera Scanning
1. Every scan-enabled floor screen SHALL provide a distinct UI button (e.g., a massive 64x64px camera icon) to activate the mobile camera scanner.
2. The scanner SHALL request necessary browser video permissions and render a live feed from the device's rear-facing camera.
3. The scanner SHALL process the video feed in real-time to detect and decode 2D barcodes.

### FR-2: Supported Formats (2D Only)
1. The system SHALL strictly support parsing **2D Barcodes** (QR Codes, Data Matrix).
2. 1D barcodes (e.g., Code 128, UPC) are deprecated in this workflow as they cannot hold the complex JSON payloads required for VMI/Trading lot identification.

### FR-3: Label Generation (QR)
1. The system SHALL provide functionality to generate and print 2D QR Code labels for items that arrive without scannable QR codes.
2. The generated QR payload SHALL be structured securely, favoring a UUID lookup (`{"type": "lot", "id": "uuid"}`) rather than massive unencrypted data blobs.

## 4. Non-Functional Requirements & UX
1. **Visual Feedback:** As mandated by `brand-design-system.md`, every successful scan MUST trigger a full-screen color flash (Green for success, Red for failure).
2. **Auditory Feedback:** Upon a successful camera decode, the web application SHALL trigger a short, distinct audio beep to simulate hardware scanner feedback.
3. **Environment:** The camera scanner MUST support a "torch" (flashlight) toggle if the mobile device's API permits it, to handle poorly lit warehouse aisles.

## 5. Out of Scope
- Integration with external Bluetooth/Serial hardware scanners.
- "Keyboard wedge" input interception.
- 1D barcode parsing.

## 6. Acceptance Criteria
1. A user on a mobile device can tap the "Scan" button, grant camera permissions, and the live camera feed appears.
2. The camera successfully decodes a 2D QR code, plays an audio beep, flashes the screen green, and passes the payload to the active workflow.
3. The system successfully generates a downloadable/printable 2D QR code payload for an unknown item during the Receiving flow.
