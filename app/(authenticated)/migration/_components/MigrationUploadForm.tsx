"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { commitUbotMigration, getMigrationSummary, resolveMigrationException, stageUbotMigration, type MigrationExceptionSummary } from "@/lib/actions/data-migration";

type StageResult = Awaited<ReturnType<typeof stageUbotMigration>>;

export function MigrationUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<StageResult | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<MigrationExceptionSummary[]>([]);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function stage() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("openingDate", "2026-10-09");
    startTransition(async () => {
      setCommitMessage(null);
      try {
        const staged = await stageUbotMigration(formData);
        setResult(staged);
        if (staged.ok) {
          const summary = await getMigrationSummary(staged.batchId);
          if (summary.ok) setExceptions(summary.exceptions);
        }
      } catch (error) {
        setResult({ ok: false, error: error instanceof Error ? error.message : "The workbook could not be staged." });
      }
    });
  }

  function commit() {
    if (!result || !result.ok || result.status !== "staged") return;
    startTransition(async () => {
      const response = await commitUbotMigration(result.batchId);
      setCommitMessage(response.ok ? `Committed ${response.committedRows} opening balance row(s).` : response.error);
    });
  }

  function resolve(exceptionId: string) {
    startTransition(async () => {
      const response = await resolveMigrationException(exceptionId, resolutionNotes[exceptionId] ?? "");
      if (!response.ok) {
        setCommitMessage(response.error);
        return;
      }
      if (result?.ok) {
        const summary = await getMigrationSummary(result.batchId);
        if (summary.ok) {
          setExceptions(summary.exceptions);
          setResult((current) => current?.ok ? { ...current, status: summary.batch.status, blockingIssues: summary.exceptions.filter((item) => item.severity === "blocking" && item.resolutionStatus === "open").length } : current);
        }
      }
    });
  }

  const canCommit = result?.ok && result.status === "staged" && result.blockingIssues === 0;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="border border-outline-variant/40 bg-surface-white p-5 shadow-elevation-1">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 text-brand-navy" size={22} />
          <div>
            <h2 className="font-heading text-title-md font-bold text-on-surface">UBoT VMI opening seed</h2>
            <p className="mt-1 text-body-sm text-text-grey">Upload the current workbook. The migration uses `Location Matrix` for opening stock, `CODES` for item enrollment, and keeps historical sheets as reference evidence.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept=".xlsx" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-12 items-center gap-2 border border-outline px-4 font-label text-label font-bold text-on-surface hover:bg-surface-grey"><Upload size={18} /> Select workbook</button>
          <span className="font-mono text-body-sm text-text-grey">{file?.name ?? "No workbook selected"}</span>
          <button type="button" onClick={stage} disabled={!file || isPending} className="inline-flex h-12 items-center gap-2 bg-brand-navy px-4 font-label text-label font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isPending ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />} Stage workbook</button>
        </div>
      </div>
      {result && (
        <div className={`border p-5 ${result.ok && result.blockingIssues === 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          {result.ok ? <>
            <div className="flex items-start gap-3">
              {result.blockingIssues === 0 ? <CheckCircle2 className="text-emerald-700" size={20} /> : <AlertTriangle className="text-amber-700" size={20} />}
              <div><p className="font-heading font-bold text-on-surface">Batch {result.status}</p><p className="mt-1 text-body-sm text-text-grey">{result.sourceRows} source rows staged, {result.blockingIssues} blocking issue(s), and {result.warningIssues} warning(s).</p><p className="mt-1 font-mono text-mono-sm text-text-grey">{result.batchId}</p></div>
            </div>
            {canCommit && <button type="button" onClick={commit} disabled={isPending} className="mt-4 inline-flex h-12 items-center gap-2 bg-emerald-700 px-4 font-label text-label font-bold text-white disabled:opacity-50">{isPending && <Loader2 size={18} className="animate-spin" />} Commit opening seed</button>}
            {exceptions.length > 0 && <div className="mt-5 border-t border-amber-200 pt-4"><h3 className="font-heading font-bold text-on-surface">Review queue</h3><div className="mt-3 space-y-3">{exceptions.map((exception) => <div key={exception.id} className="border border-outline-variant/40 bg-surface-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-label text-label font-bold text-on-surface">{exception.severity} · {exception.code}</p><p className="mt-1 text-body-sm text-text-grey">{exception.message}</p></div><span className="font-label text-label text-text-grey">{exception.resolutionStatus}</span></div>{exception.resolutionStatus === "open" && <div className="mt-3 flex flex-wrap gap-2"><input value={resolutionNotes[exception.id] ?? ""} onChange={(event) => setResolutionNotes((current) => ({ ...current, [exception.id]: event.target.value }))} placeholder="Resolution note" className="h-10 min-w-64 flex-1 border border-outline px-3 text-body-sm" /><button type="button" onClick={() => resolve(exception.id)} disabled={isPending} className="inline-flex h-10 items-center gap-2 border border-brand-navy px-3 font-label text-label font-bold text-brand-navy disabled:opacity-50">Resolve</button></div>}</div>)}</div></div>}
          </> : <p className="text-body-sm text-rose-800">{result.error}</p>}
          {commitMessage && <p className="mt-3 text-body-sm font-bold text-on-surface">{commitMessage}</p>}
        </div>
      )}
    </div>
  );
}
