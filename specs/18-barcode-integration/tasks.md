# Barcode & QR Integration — Tasks

Status: Draft

Sign-off:
- [ ] Technical Lead Sign-off
- [ ] Product/Operations Lead Sign-off

---

## Task Checklist

### 1. Mobile Camera Scanner
- [ ] **Task 18.1: Build `<MobileQRScanner>` Component**
  - Install and configure `html5-qrcode`.
  - Configure the library to strictly parse 2D QR Codes to improve processing speed.
  - Render the video feed component and handle browser camera permission requests gracefully.
- [ ] **Task 18.2: Implement `ScanFeedbackProvider`**
  - Build the React Context provider that wraps the application layout.
  - Implement the full-screen color flash (Green/Red) using standard Tailwind classes (`bg-status-available`, `bg-status-held`) in a fixed overlay.
  - Implement the Web Audio API synthesizer to emit a short 100ms beep on success.

### 2. QR Code Generation
- [ ] **Task 18.3: Build `<LabelPrinter>` Component**
  - Install `react-qr-code`.
  - Implement the generator that accepts a `dsw_id` UUID payload and renders a scannable 2D matrix.
  - Provide a hook to trigger the browser's native `window.print()` targeting just the label component.

### 3. Integration & Testing
- [ ] **Task 18.4: Write Playwright Scanner Simulation**
  - Because Playwright runs in a CI environment without a physical camera, write a custom E2E utility that mocks the `html5-qrcode` callback, allowing automated tests to artificially "scan" a string and trigger the downstream business logic.
