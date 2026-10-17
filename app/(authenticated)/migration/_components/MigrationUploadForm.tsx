"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, Circle, FileSpreadsheet, Loader2, LockKeyhole, Upload } from "lucide-react";
import { commitUbotMigration, getMigrationSummary, resolveMigrationException, type MigrationExceptionSummary, type MigrationResult } from "@/lib/actions/data-migration";

type StageResult = MigrationResult;
type WorkflowStep = { label: string; detail: string };

const WORKFLOW_STEPS: WorkflowStep[] = [
  { label: "Import", detail: "Choose workbook" },
  { label: "Migrate", detail: "Read source data" },
  { label: "Stage", detail: "Review exceptions" },
  { label: "Confirm", detail: "Create opening stock" },
];

function workflowIndex(file: File | null, result: StageResult | null, isCommitted: boolean, isPending: boolean): number {
  if (isCommitted) return 4;
  if (result?.ok && result.status === "staged" && result.blockingIssues === 0) return 3;
  if (result?.ok || isPending) return 2;
  if (file) return 1;
  return 0;
}

export function MigrationUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<StageResult | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<MigrationExceptionSummary[]>([]);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [isCommitted, setIsCommitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const activeStep = workflowIndex(file, result, isCommitted, isPending);

  function stage() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("openingDate", "2026-10-09");
    startTransition(async () => {
      setCommitMessage(null);
      try {
        const response = await fetch("/api/migration/ubot", { method: "POST", body: formData });
        const staged = await response.json() as MigrationResult;
        if (!response.ok && !("error" in staged)) throw new Error("The migration upload failed.");
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
      if (response.ok) {
        setIsCommitted(true);
        setCommitMessage(`Opening seed confirmed. ${response.committedRows} opening balance row(s) committed.`);
      } else {
        setCommitMessage(response.error);
      }
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
  const openBlocking = exceptions.filter((exception) => exception.severity === "blocking" && exception.resolutionStatus === "open").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <nav aria-label="Migration progress" className="rounded-2xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 sm:p-6">
        <ol className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-0">
          {WORKFLOW_STEPS.map((step, index) => {
            const complete = activeStep > index;
            const current = activeStep === index;
            return (
              <li key={step.label} className="relative flex items-start gap-3 sm:block sm:text-center">
                {index < WORKFLOW_STEPS.length - 1 && <span aria-hidden="true" className={`absolute left-8 right-[-50%] top-4 hidden h-px sm:block ${complete ? "bg-brand-blue" : "bg-outline-variant/50"}`} />}
                <span className={`relative z-10 mx-0 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 sm:mx-auto ${complete ? "border-brand-blue bg-brand-blue text-white" : current ? "border-brand-blue bg-brand-blue/10 text-brand-blue" : "border-outline-variant bg-surface-white text-text-grey"}`}>
                  {complete ? <Check size={16} /> : current ? <Circle size={12} fill="currentColor" /> : <span className="font-mono text-mono-sm">{index + 1}</span>}
                </span>
                <span className="relative z-10 block sm:mt-2"><span className={`block font-label text-label font-bold ${current || complete ? "text-on-surface" : "text-text-grey"}`}>{step.label}</span><span className="mt-0.5 block font-body text-body-sm text-text-grey">{step.detail}</span></span>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-6 shadow-elevation-1 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue"><FileSpreadsheet size={22} /></span>
          <div>
            <p className="font-label text-label font-bold uppercase text-brand-blue">Step 1 · Import</p>
            <h2 className="mt-1 font-heading text-title-md font-bold text-on-surface">Select the approved workbook</h2>
            <p className="mt-2 font-body text-body-md text-text-grey">The current workbook becomes the opening snapshot. Location Matrix supplies stock, CODES enrolls items, and historical sheets remain reference evidence.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input ref={inputRef} type="file" accept=".xlsx" className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); setExceptions([]); setCommitMessage(null); setIsCommitted(false); }} />
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-brand-blue px-5 font-label text-label font-bold text-brand-blue hover:bg-brand-blue/10 focus:outline-none focus:ring-2 focus:ring-brand-blue"><Upload size={18} /> Select workbook</button>
          <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-text-grey">{file?.name ?? "No workbook selected"}</span>
          <button type="button" onClick={stage} disabled={!file || isPending || isCommitted} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-blue px-5 font-label text-label font-bold text-white hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50">{isPending ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />} Migrate workbook</button>
        </div>
      </section>

      {result?.ok && <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-6 shadow-elevation-1 sm:p-8" aria-live="polite">
        <div className="flex items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${openBlocking > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>{openBlocking > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}</span>
          <div className="min-w-0 flex-1"><p className="font-label text-label font-bold uppercase text-brand-blue">Step 3 · Stage</p><h2 className="mt-1 font-heading text-title-md font-bold text-on-surface">{openBlocking > 0 ? "Review before confirmation" : "Ready for confirmation"}</h2><p className="mt-2 font-body text-body-md text-text-grey">{result.sourceRows} source rows staged · {openBlocking} blocking issue(s) open · {result.warningIssues} warning(s)</p><p className="mt-2 truncate font-mono text-mono-sm text-text-grey">Batch {result.batchId}</p></div>
        </div>
        {exceptions.length > 0 && <div className="mt-6 border-t border-outline-variant/40 pt-6"><div className="flex items-center justify-between gap-3"><h3 className="font-heading text-title-sm font-bold text-on-surface">Review queue</h3><span className="rounded-full bg-warning/15 px-3 py-1 font-label text-label font-bold text-warning">{openBlocking} open</span></div><div className="mt-4 space-y-3">{exceptions.map((exception) => <div key={exception.id} className="rounded-xl border border-outline-variant/40 bg-surface-grey/40 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-label text-label font-bold uppercase text-on-surface">{exception.severity} · {exception.code}</p><p className="mt-1 font-body text-body-sm text-text-grey">{exception.message}</p></div><span className="shrink-0 font-label text-label text-text-grey">{exception.resolutionStatus}</span></div>{exception.resolutionStatus === "open" && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={resolutionNotes[exception.id] ?? ""} onChange={(event) => setResolutionNotes((current) => ({ ...current, [exception.id]: event.target.value }))} placeholder="Resolution note" className="min-h-11 flex-1 rounded-lg border border-outline px-3 font-body text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" /><button type="button" onClick={() => resolve(exception.id)} disabled={isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-blue px-4 font-label text-label font-bold text-brand-blue disabled:opacity-50">Resolve issue</button></div>}</div>)}</div></div>}
        <div className="mt-6 flex items-center gap-3 border-t border-outline-variant/40 pt-6"><LockKeyhole size={18} className="text-text-grey" /><p className="font-body text-body-sm text-text-grey">Confirmation stays locked until all blocking issues are resolved.</p>{canCommit && <button type="button" onClick={commit} disabled={isPending} className="ml-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-success px-5 font-label text-label font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{isPending && <Loader2 size={18} className="animate-spin" />} Confirm opening seed</button>}</div>
      </section>}

      {!result?.ok && result?.error && <section className="rounded-2xl border border-error/30 bg-error/5 p-6" role="alert"><p className="font-label text-label font-bold uppercase text-error">Import failed</p><p className="mt-2 font-body text-body-md text-error">{result.error}</p><p className="mt-2 font-body text-body-sm text-text-grey">Correct the source workbook or retry the import.</p></section>}
      {commitMessage && <section className={`rounded-2xl border p-6 ${isCommitted ? "border-success/30 bg-success/5" : "border-error/30 bg-error/5"}`} role="status"><div className="flex items-start gap-3">{isCommitted ? <CheckCircle2 className="text-success" size={22} /> : <AlertTriangle className="text-error" size={22} />}<p className={`font-body text-body-md ${isCommitted ? "text-success" : "text-error"}`}>{commitMessage}</p></div></section>}
    </div>
  );
}
