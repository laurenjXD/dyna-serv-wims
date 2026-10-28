"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  EMPTY_OFFLINE_STATUS,
  nextOfflineStatus,
  type OfflineOperationType,
  type OfflineStatus,
} from "./index";
import { queueOfflineObservation } from "./capture";
import { clearExpiredOfflineData } from "./storage";
import { getOfflineQueueCounts, releaseSyncLock, replayStoredOfflineEntriesOnce, syncLockAvailable } from "./sync";
import { submitOfflineEntry } from "./client";

type OfflineContextValue = OfflineStatus & {
  queueObservation: (actionType: OfflineOperationType, payload: Record<string, unknown>) => Promise<void>;
  retrySync: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue>({
  ...EMPTY_OFFLINE_STATUS,
  queueObservation: async () => { throw new Error("offline_user_unavailable"); },
  retrySync: async () => {},
});

export function useOfflineStatus(): OfflineContextValue {
  return useContext(OfflineContext);
}

async function pingServer(): Promise<boolean> {
  try {
    const response = await fetch("/api/ping", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export function OfflineRuntime({
  currentUserId,
  children,
}: {
  currentUserId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OfflineStatus>(EMPTY_OFFLINE_STATUS);

  const refreshCounts = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const counts = await getOfflineQueueCounts(currentUserId);
      setStatus((current) => ({ ...current, ...counts }));
    } catch {
      setStatus((current) => ({ ...current, sync: "attention" }));
    }
  }, [currentUserId]);

  const probe = useCallback(async () => {
    const browserOnline = typeof navigator === "undefined" || navigator.onLine;
    if (!browserOnline) {
      setStatus((current) => nextOfflineStatus(current, "probe_offline"));
      await refreshCounts();
      return false;
    }
    setStatus((current) => nextOfflineStatus(current, "probe_start"));
    const reachable = await pingServer();
    setStatus((current) => nextOfflineStatus(current, reachable ? "probe_online" : "probe_offline"));
    return reachable;
  }, [refreshCounts]);

  const retrySync = useCallback(async () => {
    if (!currentUserId) return;
    const reachable = await probe();
    if (!reachable || !syncLockAvailable()) return;
    setStatus((current) => nextOfflineStatus(current, "sync_start"));
    try {
      const results = await replayStoredOfflineEntriesOnce(currentUserId, submitOfflineEntry);
      const attention = results.some((result) => result.outcome === "rejected" || result.outcome === "conflict");
      setStatus((current) => ({
        ...nextOfflineStatus(current, attention ? "sync_attention" : "sync_success"),
        lastSyncedAt: Date.now(),
      }));
      await refreshCounts();
      if (results.some((result) => result.outcome === "applied" || result.outcome === "duplicate")) router.refresh();
    } finally {
      releaseSyncLock();
    }
  }, [currentUserId, probe, refreshCounts, router]);

  useEffect(() => {
    let active = true;
    void clearExpiredOfflineData().catch(() => {});
    void refreshCounts();
    void retrySync();

    const handleOnline = () => { if (active) void retrySync(); };
    const handleVisibility = () => {
      if (active && document.visibilityState === "visible") void retrySync();
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void retrySync();
    }, 15_000);
    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, [refreshCounts, retrySync]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  const value = useMemo<OfflineContextValue>(() => ({
    ...status,
    queueObservation: async (actionType, payload) => {
      if (!currentUserId) throw new Error("offline_user_unavailable");
      await queueOfflineObservation({ capturedByUserId: currentUserId, actionType, payload });
      await refreshCounts();
    },
    retrySync,
  }), [currentUserId, refreshCounts, retrySync, status]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
