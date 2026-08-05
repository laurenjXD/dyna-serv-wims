# Barcode & QR Integration — Tasks

Status: Draft

Sign-off:
- [ ] Technical Lead Sign-off
- [ ] Product/Operations Lead Sign-off

---

## Task Checklist

### 1. Global Scan Interception
- [ ] **Task 18.1: Build `useScanner` Hook**
  - Implement the keyboard wedge event listener.
  - Tune the timing threshold (e.g., `< 50ms` between keystrokes) to accurately differentiate between human typing and hardware scanners.
  - Ensure it ignores keystrokes if the active DOM element is an `INPUT` or `TEXTAREA`.
- [ ] **Task 18.2: Implement `ScanFeedbackProvider`**
  - Build the React Context provider that wraps the application layout.
  - Implement the full-screen color flash (Green/Red) using standard Tailwind classes (`bg-status-available`, `bg-status-held`) in a fixed overlay.

### 2. Software Camera Scanner
- [ ] **Task 18.3: Build `<CameraScannerModal>`**
  - Install and configure `html5-qrcode`.
  - Build the UI modal with a large 64x64px close button optimized for gloved hands.
  - Route the camera's `onScanSuccess` output into the same callback chain used by `useScanner`.

### 3. QR Code Generation
- [ ] **Task 18.4: Build `<LabelPrinter>` Component**
  - Install `react-qr-code`.
  - Implement the generator that accepts a `dsw_id` UUID payload and renders a scannable 2D matrix.
  - Provide a hook to trigger the browser's native `window.print()` targeting just the label component.

### 4. Integration & Testing
- [ ] **Task 18.5: Write Playwright Hardware Scanner Simulation**
  - Because Playwright runs in a CI environment without a physical scanner, write a custom E2E utility `simulateHardwareScan(page, barcode)` that fires rapid keyboard events (`page.keyboard.press()`) followed by `Enter` to guarantee the `useScanner` hook functions correctly in automated tests.
