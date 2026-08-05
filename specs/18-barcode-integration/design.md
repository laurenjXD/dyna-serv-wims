# Barcode & QR Integration — Design

Status: Draft

Cites foundational specs:
- `specs/00-steering/tech.md`
- `specs/00-steering/brand-design-system.md`
- `specs/01-core-data-model/requirements.md`

## 1. Frontend Architecture: The Keyboard Wedge Interceptor

Rugged warehouse scanners act as keyboards. They type characters incredibly fast (often <15ms between keystrokes) and append an `Enter` (keycode 13) at the end. To support this natively without requiring an active input focus, we will build a global React Hook.

### 1.1 `useScanner` Custom Hook
```typescript
import { useEffect, useRef } from 'react';

export function useScanner(onScan: (barcode: string) => void) {
  const buffer = useRef('');
  const lastKeyTime = useRef(Date.now());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if the user is actively typing in a standard input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const currentTime = Date.now();
      
      // If time between keystrokes is too long (> 50ms), it's human typing, flush buffer.
      if (currentTime - lastKeyTime.current > 50) {
        buffer.current = '';
      }
      lastKeyTime.current = currentTime;

      // When scanner fires the Enter key (barcode is complete)
      if (e.key === 'Enter' && buffer.current.length > 3) {
        e.preventDefault();
        onScan(buffer.current);
        buffer.current = ''; // clear buffer
        return;
      }

      // Append character to buffer (only printable single characters)
      if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);
}
```

### 1.2 Full-Screen Flash Feedback
Per `brand-design-system.md`, every floor scan requires immediate visual feedback. 
We will implement a `<ScanFeedbackProvider>` globally that overlays a `div` with absolute positioning, firing a 300ms CSS opacity transition (`bg-status-available` for success, `bg-status-held` for error).

## 2. Software Camera Fallback

For environments without physical hardware (e.g., a supervisor checking a lot using their personal iPhone), we will integrate a software fallback.

- **Library:** `html5-qrcode` (Lightweight, well-maintained, supports both 1D and 2D).
- **Component:** `<CameraScannerModal>`
  - Invoked by pressing a large 64x64px camera button on the floor UI.
  - Renders the `Html5QrcodeScanner` view.
  - On `onScanSuccess`, it programmatically calls the exact same `onScan(barcode)` callback used by the `useScanner` hook, ensuring complete parity between hardware and software inputs.

## 3. QR Code Payload Design

When Dyna-Serv needs to generate its own labels for unknown/unbarcoded items arriving at the receiving dock, we will generate QR codes containing JSON.

**Preferred Internal Payload (UUID Lookup):**
```json
{
  "dsw_id": "a1b2c3d4-..." // UUID mapped to the `lots` table
}
```

*Note on performance:* Keeping the payload small (a single UUID rather than a massive JSON string) ensures the QR code matrix is physically less dense, which dramatically increases scanner read-speed and reliability under poor warehouse lighting.

### 3.1 QR Generation Component
- **Library:** `react-qr-code` or `qrcode.react`.
- Rendered in the browser and passed to the print driver when an Admin clicks "Print Label" on the Enrollment UI.
