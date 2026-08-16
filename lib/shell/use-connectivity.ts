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
  if (typeof navigator === "undefined") return "checking";
  return navigator.onLine ? "online" : "offline";
}

export function useConnectivityStatus(): ConnectivityStatus {
  const [status, setStatus] = useState<ConnectivityStatus>(() =>
    readNavigatorOnLine(),
  );

  useEffect(() => {
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
