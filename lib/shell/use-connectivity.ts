// Client-only hook exposing the browser's connectivity status
// (`online` | `offline` | `checking`) for the shell header's
// ConnectivityIndicator.
//
// Traceability: specs/05-ui-shell-and-navigation/tasks.md §5 "Implement
// read-only connectivity indicator (online, offline, checking) ... via
// `03` contract." requirements.md R8.1/R8.2.
//
// Scope note: this hook reports connectivity only, not synchronization —
// see lib/shell/__tests__/use-connectivity.test.ts for the same scope note.

"use client";

import { useEffect, useState } from "react";

export type ConnectivityStatus = "online" | "offline" | "checking";

function readNavigatorOnLine(): ConnectivityStatus {
  return navigator.onLine ? "online" : "offline";
}

export function useConnectivityStatus(): ConnectivityStatus {
  // Always starts at "checking" — on both the server-rendered HTML and the
  // client's first render before effects run — never reading `navigator`
  // during render itself. Node 21+ ships a partial global `navigator` with
  // no real `onLine` property, so the previous `typeof navigator ===
  // "undefined"` SSR guard no longer holds: it silently fell through to
  // `navigator.onLine` being `undefined` (falsy) during SSR, rendering
  // "Offline" server-side while a real online browser hydrated to "Online"
  // — a hydration mismatch on every authenticated page's header (the shell
  // chrome mounts this on literally every route). Reading the real value
  // only inside this effect (client-only, post-mount) keeps the first paint
  // identical on server and client, then corrects it immediately after.
  const [status, setStatus] = useState<ConnectivityStatus>("checking");

  useEffect(() => {
    setStatus(readNavigatorOnLine());

    const handleOnline = () => setStatus("online");
    const handleOffline = () => setStatus("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return status;
}
