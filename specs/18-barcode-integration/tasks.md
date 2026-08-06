# Barcode & QR Integration — Tasks

Status: Approved

Sign-off:
- [x] Technical Lead Sign-off — User / System, 2026-08-06 (documentation and contract review; implementation tests remain pre-build tasks)
- [x] Product/Operations Lead Sign-off — User / System, 2026-08-06 (standing auto-sign-off for the scoped FR-2.3 decision)

---

## Task Checklist

### 1. Mobile Camera Scanner
- [ ] **Task 18.1: Build `<MobileQRScanner>` Component**
  - Install and configure `html5-qrcode`.
  - Configure ordinary workflows to parse only approved 2D formats; add Code 128 only on the `22` R11 route and accept only `WAN:<uuid>`.
  - Render the video feed component and handle browser camera permission requests gracefully.
- [ ] **Task 18.2: Implement `ScanFeedbackProvider`**
  - Build the React Context provider that wraps the application layout.
  - Implement the full-screen color flash (Green/Red) using standard Tailwind classes (`bg-status-available`, `bg-status-held`) in a fixed overlay.
  - Implement the Web Audio API synthesizer to emit a short 100ms beep on success.

### 2. QR Code Generation
- [ ] **Task 18.3: Build `<LabelPrinter>` Component**
  - Install `react-qr-code`.
  - Implement the generator for ordinary internal `dsw_id` UUID payloads as a scannable 2D matrix; do not use this task to generate the R11 `WAN:<uuid>` Code 128 label.
  - Provide a hook to trigger the browser's native `window.print()` targeting just the label component.

### 3. Integration & Testing
- [ ] **Task 18.4: Write Playwright Scanner Simulation**
  - Because Playwright runs in a CI environment without a physical camera, write a custom E2E utility that mocks the `html5-qrcode` callback, allowing automated tests to artificially "scan" a string and trigger the downstream business logic.
  - Add assertions that `WAN:<uuid>` is accepted only in the R11 inbound pre-label context and that Code 128/UPC payloads are rejected in every other context.

### 4. FR-2.3 contract acceptance

- [x] The 1D exception is limited to supplier-initiated inbound pre-labeling from `22` R11.
- [x] The payload is flat `WAN:<uuid>`, not embedded JSON and not a `lots` identifier.
- [x] Ordinary WRR, picking, item, and lot scans remain 2D-only.
- [ ] Runtime scanner-library and Playwright tests pass after implementation.
