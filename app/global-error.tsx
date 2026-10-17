"use client";

import { useEffect } from "react";

// Unlike a segment error boundary, this also catches failures in the
// authenticated layout. Without it, a layout render error can leave the
// entire site blank after sign-in.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application layout failed to render", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 0, color: "#10245e" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1>We couldn&apos;t load this page</h1>
            <p>Your session may still be active. Reload the page to try again.</p>
            {error.digest && <p style={{ fontSize: 12 }}>Reference: {error.digest}</p>}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ padding: "12px 20px", border: 0, borderRadius: 8, background: "#10245e", color: "white", cursor: "pointer" }}
            >
              Reload page
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
