# Barcode & QR Integration — Design

Status: Draft

Cites foundational specs:
- `specs/00-steering/tech.md`
- `specs/00-steering/brand-design-system.md`
- `specs/01-core-data-model/requirements.md`

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
    // Configure scanner to prefer rear camera and restrict to 2D formats
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]
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
Per `brand-design-system.md`, every floor scan requires immediate feedback. 
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

### 2.1 QR Generation Component
- **Library:** `react-qr-code` or `qrcode.react`.
- Rendered in the browser and passed to the print driver when an Admin clicks "Print Label" on the Enrollment UI.
