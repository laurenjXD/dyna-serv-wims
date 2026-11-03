"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, Wifi, WifiOff } from "@/components/ui/icons";
import { useOfflineStatus } from "@/lib/offline/provider";

export default function SyncPage() {
  const { connectivity, sync, pendingCount, attentionCount, lastSyncedAt, retrySync } = useOfflineStatus();
  const online = connectivity === "online";
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <p className="font-label text-label-sm font-bold uppercase tracking-wider text-text-grey">System</p>
        <h1 className="mt-1 font-heading text-headline-lg font-bold text-on-surface">Offline sync</h1>
        <p className="mt-2 font-body text-body-md text-text-grey">Only physical scan observations are queued. Receiving confirmation, putaway, pick-list generation, approvals, and final dispatch always require live connection.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Sync status">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          {online ? <Wifi className="text-status-available" aria-hidden="true" /> : <WifiOff className="text-status-pending" aria-hidden="true" />}
          <p className="mt-3 font-label text-label-sm font-bold uppercase text-text-grey">Connection</p>
          <p className="mt-1 font-heading text-title-lg font-bold text-on-surface">{connectivity}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          {sync === "attention" ? <AlertTriangle className="text-status-held" aria-hidden="true" /> : <CheckCircle2 className="text-status-available" aria-hidden="true" />}
          <p className="mt-3 font-label text-label-sm font-bold uppercase text-text-grey">Queue</p>
          <p className="mt-1 font-heading text-title-lg font-bold text-on-surface">{pendingCount ?? 0} pending</p>
        </div>
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <AlertTriangle className={attentionCount ? "text-status-held" : "text-text-grey"} aria-hidden="true" />
          <p className="mt-3 font-label text-label-sm font-bold uppercase text-text-grey">Attention</p>
          <p className="mt-1 font-heading text-title-lg font-bold text-on-surface">{attentionCount ?? 0}</p>
        </div>
      </section>
      <section className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <p className="font-body text-body-md text-text-grey">
          {sync === "syncing" ? "Synchronizing queued observations…" : attentionCount ? "Some observations need supervisor attention. They were preserved and were not merged automatically." : lastSyncedAt ? `Last replay attempt: ${new Date(lastSyncedAt).toLocaleString()}` : "No replay has completed in this browser session."}
        </p>
        <button type="button" onClick={() => void retrySync()} className="mt-4 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-label text-body-md font-bold text-surface-white disabled:opacity-50" disabled={sync === "syncing"}>
          <RefreshCw size={18} className={sync === "syncing" ? "animate-spin" : ""} aria-hidden="true" />
          Retry sync
        </button>
      </section>
    </main>
  );
}
