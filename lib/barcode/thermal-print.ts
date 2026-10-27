// Thermal-label print helpers shared by the QR and unit-label surfaces.
// The second animation frame gives react-qr-code time to commit its SVG before
// Chromium snapshots the print document.
export function scheduleThermalPrint(): void {
  if (typeof window === "undefined") return;

  const print = () => window.print();
  const nextFrame = (callback: () => void) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(callback);
    } else {
      window.setTimeout(callback, 0);
    }
  };

  nextFrame(() => nextFrame(print));
}
