"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Ban, Check, CheckCircle2, Circle, FileSpreadsheet, Loader2, LockKeyhole, Upload } from "@/components/ui/icons";
import { approveUbotMigration, cancelMigrationBatch, commitUbotMigration, getMigrationSummary, listMigrationBatches, resolveMigrationException, type MigrationBatchListItem, type MigrationExceptionSummary, type MigrationResult } from "@/lib/actions/data-migration";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MIGRATION_RESOLUTION_CATEGORIES } from "@/lib/migration/exception-resolution";

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
  if (result?.ok && result.status === "approved") return 3;
  if (result?.ok && result.status === "staged" && result.blockingIssues === 0) return 2;
  if (result?.ok || isPending) return 2;
  if (file) return 1;
  return 0;
}

export function MigrationUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<StageResult | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<MigrationExceptionSummary[]>([]);
  const [previousBatches, setPreviousBatches] = useState<MigrationBatchListItem[]>([]);
  const [previousBatchesError, setPreviousBatchesError] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [resolutionCategories, setResolutionCategories] = useState<Record<string, string>>({});
  const [isCommitted, setIsCommitted] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [isPending, startTransition] = useTransition();
  const activeStep = workflowIndex(file, result, isCommitted, isPending);

  async function refreshPreviousBatches() {
    try {
      const response = await listMigrationBatches();
      if (response.ok) {
        setPreviousBatches(response.batches);
        setPreviousBatchesError(null);
      } else {
        setPreviousBatchesError(response.error);
      }
    } catch (error) {
      // Previous-stage history is optional. A failed authorization/database
      // lookup must not become an unhandled rejection that replaces the
      // whole authenticated workspace with the global error screen.
      console.error("[migration] previous stages could not be loaded", error);
      setPreviousBatchesError("Previous stages are temporarily unavailable. You can still import a workbook.");
    }
  }

  useEffect(() => {
    void refreshPreviousBatches();
  }, []);

  function openPreviousBatch(batch: MigrationBatchListItem) {
    startTransition(async () => {
      const summary = await getMigrationSummary(batch.id);
      if (!summary.ok) {
        setPreviousBatchesError(summary.error);
        return;
      }
      const blockingIssues = summary.exceptions.filter((exception) => exception.severity === "blocking" && exception.resolutionStatus === "open").length;
      const warningIssues = summary.exceptions.filter((exception) => exception.severity === "warning").length;
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
      setReviewOnly(true);
      setResult({ ok: true, batchId: summary.batch.id, status: summary.batch.status, blockingIssues, warningIssues, sourceRows: summary.batch.sourceRows });
      setExceptions(summary.exceptions);
      setResolutionNotes({});
      setResolutionCategories(Object.fromEntries(summary.exceptions.filter((exception) => exception.resolutionCategory).map((exception) => [exception.id, exception.resolutionCategory ?? ""])));
      setCommitMessage(null);
      setIsCommitted(summary.batch.status === "committed");
    });
  }

  function cancelPreviousBatch(batch: MigrationBatchListItem) {
    if (!window.confirm(`Cancel this saved migration stage?\n\n${batch.sourceFileName}\n\nIt will be removed from Previous stages and kept only for audit history.`)) return;
    startTransition(async () => {
      const response = await cancelMigrationBatch(batch.id);
      if (response.ok) {
        setPreviousBatches((current) => current.filter((item) => item.id !== batch.id));
        setPreviousBatchesError(null);
      } else {
        setPreviousBatchesError(response.error);
      }
    });
  }

  function cancelCurrentMigration() {
    if (!result?.ok) return;
    if (!window.confirm("Cancel this migration stage?\n\nIt will be removed from Previous stages and kept only for audit history.")) return;
    startTransition(async () => {
      const response = await cancelMigrationBatch(result.batchId);
      if (response.ok) {
        leaveReview();
        await refreshPreviousBatches();
      } else {
        setCommitMessage(response.error);
      }
    });
  }

  function stage() {
    if (!file) return;
    const formData = new FormData();
    formData.set("openingDate", "2026-10-09");
    startTransition(async () => {
      setReviewOnly(false);
      setCommitMessage(null);
      try {
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const sourcePath = `ubot-vmi-v1/${crypto.randomUUID()}/${safeFileName}`;
        const supabase = createSupabaseBrowserClient();
        const upload = await supabase.storage.from("migration-source-files").upload(sourcePath, file, { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false });
        if (upload.error) throw new Error(`The workbook could not be uploaded: ${upload.error.message}`);
        formData.set("sourcePath", sourcePath);
        formData.set("sourceFileName", file.name);
        const response = await fetch("/api/migration/ubot", { method: "POST", body: formData });
        const responseText = await response.text();
        let staged: MigrationResult;
        try {
          staged = JSON.parse(responseText) as MigrationResult;
        } catch {
          throw new Error(responseText.trim() || `The migration upload failed (${response.status}).`);
        }
        if (!response.ok && !("error" in staged)) throw new Error("The migration upload failed.");
        setResult(staged);
        if (staged.ok) {
          const summary = await getMigrationSummary(staged.batchId);
          if (summary.ok) setExceptions(summary.exceptions);
          await refreshPreviousBatches();
        }
      } catch (error) {
        setResult({ ok: false, error: error instanceof Error ? error.message : "The workbook could not be staged." });
      }
    });
  }

  function commit() {
    if (!result || !result.ok || result.status !== "approved") return;
    startTransition(async () => {
      const response = await commitUbotMigration(result.batchId);
      if (response.ok) {
        router.push(`/migration/success?rows=${response.committedRows}`);
      } else {
        setCommitMessage(response.error);
      }
    });
  }

  function approve() {
    if (!result || !result.ok || result.status !== "staged" || result.blockingIssues !== 0) return;
    startTransition(async () => {
      const response = await approveUbotMigration(result.batchId);
      if (response.ok) {
        setResult((current) => current?.ok ? { ...current, status: "approved" } : current);
        setCommitMessage("Migration report approved. It is ready to commit.");
        await refreshPreviousBatches();
      } else {
        setCommitMessage(response.error);
      }
    });
  }

  function resolve(exceptionId: string) {
    startTransition(async () => {
      const response = await resolveMigrationException(exceptionId, resolutionCategories[exceptionId] ?? "", resolutionNotes[exceptionId] ?? "");
      if (!response.ok) {
        setCommitMessage(response.error);
        return;
      }
      if (result?.ok) {
        const summary = await getMigrationSummary(result.batchId);
        if (summary.ok) {
          setExceptions(summary.exceptions);
          setResolutionCategories(Object.fromEntries(summary.exceptions.filter((exception) => exception.resolutionCategory).map((exception) => [exception.id, exception.resolutionCategory ?? ""])));
          setResult((current) => current?.ok ? { ...current, status: summary.batch.status, blockingIssues: summary.exceptions.filter((item) => item.severity === "blocking" && item.resolutionStatus === "open").length } : current);
          await refreshPreviousBatches();
        }
      }
    });
  }

  function leaveReview() {
    if (inputRef.current) inputRef.current.value = "";
    setReviewOnly(false);
    setFile(null);
    setResult(null);
    setExceptions([]);
    setResolutionCategories({});
    setResolutionNotes({});
    setCommitMessage(null);
    setIsCommitted(false);
  }

  const canApprove = result?.ok && result.status === "staged" && result.blockingIssues === 0;
  const canCommit = result?.ok && result.status === "approved" && result.blockingIssues === 0;
  const openBlocking = exceptions.filter((exception) => exception.severity === "blocking" && exception.resolutionStatus === "open").length;
  const openWarnings = exceptions.filter((exception) => exception.severity === "warning" && exception.resolutionStatus === "open").length;
  const statusLabel = (status: string) => status === "needs_review" ? "Needs review" : status === "staged" ? "Staged" : status === "approved" ? "Approved" : status === "committed" ? "Committed" : status;

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

      {reviewOnly && <section className="rounded-2xl border border-brand-blue/20 bg-brand-blue/5 p-4 shadow-elevation-1" aria-label="Review navigation">
        <div className="flex flex-wrap gap-3"><button type="button" onClick={leaveReview} disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-blue px-5 font-label text-label font-bold text-brand-blue disabled:opacity-50"><ArrowLeft size={18} /> Back</button><button type="button" onClick={cancelCurrentMigration} disabled={isPending || isCommitted} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-error/60 px-5 font-label text-label font-bold text-error disabled:opacity-50"><Ban size={17} /> Cancel migration</button></div>
        <p className="mt-3 font-body text-body-sm text-text-grey">You are reviewing a saved migration stage. Back returns to the migration workspace.</p>
      </section>}

      {!reviewOnly && <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-6 shadow-elevation-1 sm:p-8" aria-labelledby="previous-migration-stages">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-label text-label font-bold uppercase text-brand-blue">Continue an existing migration</p>
            <h2 id="previous-migration-stages" className="mt-1 font-heading text-title-md font-bold text-on-surface">Previous stages</h2>
            <p className="mt-2 font-body text-body-sm text-text-grey">Reopen a saved workbook stage instead of importing the same workbook again.</p>
          </div>
          <button type="button" onClick={() => { void refreshPreviousBatches(); }} disabled={isPending} className="inline-flex min-h-10 items-center justify-center rounded-full border border-brand-blue px-4 font-label text-label font-bold text-brand-blue disabled:opacity-50">Refresh</button>
        </div>
        {previousBatchesError && <p className="mt-4 rounded-lg bg-error/5 p-3 font-body text-body-sm text-error" role="alert">{previousBatchesError}</p>}
        {previousBatches.length === 0 ? <p className="mt-5 font-body text-body-sm text-text-grey">No saved migration stages found.</p> : <div className="mt-5 space-y-3">{previousBatches.map((batch) => <div key={batch.id} className="flex flex-col gap-4 rounded-xl border border-outline-variant/40 bg-surface-grey/40 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-all font-label text-label font-bold text-on-surface">{batch.sourceFileName}</p><span className="rounded-full bg-brand-blue/10 px-2.5 py-1 font-label text-label font-bold text-brand-blue">{statusLabel(batch.status)}</span></div><p className="mt-1 font-body text-body-sm text-text-grey">{batch.sourceRows} source rows · {batch.blockingIssues} open blocking · {batch.warningIssues} warning(s)</p><p className="mt-1 font-mono text-mono-sm text-text-grey">Saved {new Date(batch.createdAt).toLocaleString()}</p></div><div className="flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => openPreviousBatch(batch)} disabled={isPending} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-brand-blue px-5 font-label text-label font-bold text-brand-blue disabled:opacity-50">Open review</button><button type="button" onClick={() => cancelPreviousBatch(batch)} disabled={isPending} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-error/60 px-5 font-label text-label font-bold text-error disabled:opacity-50"><Ban size={16} /> Cancel stage</button></div></div>)}</div>}
      </section>}

      {!reviewOnly && <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-6 shadow-elevation-1 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue"><FileSpreadsheet size={22} /></span>
          <div>
            <p className="font-label text-label font-bold uppercase text-brand-blue">Step 1 · Import</p>
            <h2 className="mt-1 font-heading text-title-md font-bold text-on-surface">Select the approved workbook</h2>
            <p className="mt-2 font-body text-body-md text-text-grey">The current workbook becomes the opening snapshot. Location Matrix supplies stock, CODES enrolls items, and historical sheets remain reference evidence.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input ref={inputRef} type="file" accept=".xlsx" className="sr-only" onChange={(event) => { setReviewOnly(false); setFile(event.target.files?.[0] ?? null); setResult(null); setExceptions([]); setResolutionCategories({}); setCommitMessage(null); setIsCommitted(false); }} />
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-brand-blue px-5 font-label text-label font-bold text-brand-blue hover:bg-brand-blue/10 focus:outline-none focus:ring-2 focus:ring-brand-blue"><Upload size={18} /> Select workbook</button>
          <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-text-grey">{file?.name ?? "No workbook selected"}</span>
          <button type="button" onClick={stage} disabled={!file || isPending || isCommitted} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-blue px-5 font-label text-label font-bold text-white hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50">{isPending ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />} Migrate workbook</button>
        </div>
      </section>}

      {result?.ok && <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-6 shadow-elevation-1 sm:p-8" aria-live="polite">
        <div className="flex items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${openBlocking > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>{openBlocking > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}</span>
          <div className="min-w-0 flex-1"><p className="font-label text-label font-bold uppercase text-brand-blue">Step 3 · Stage</p><h2 className="mt-1 font-heading text-title-md font-bold text-on-surface">{isCommitted ? "Opening seed confirmed" : openBlocking > 0 ? "Review before approval" : result.status === "approved" ? "Approved for confirmation" : "Ready for approval"}</h2><p className="mt-2 font-body text-body-md text-text-grey">{result.sourceRows} source rows {isCommitted ? "committed" : "staged"} · {openBlocking} blocking issue(s) open · {result.warningIssues} warning(s)</p><p className="mt-2 truncate font-mono text-mono-sm text-text-grey">Batch {result.batchId}</p></div>
        </div>
        {exceptions.length > 0 && <div className="mt-6 border-t border-outline-variant/40 pt-6"><div className="flex items-center justify-between gap-3"><h3 className="font-heading text-title-sm font-bold text-on-surface">Review queue</h3><span className="rounded-full bg-warning/15 px-3 py-1 font-label text-label font-bold text-warning">{openBlocking} open blocking · {openWarnings} open warning(s)</span></div><div className="mt-4 max-h-[38rem] space-y-3 overflow-y-auto pr-2">{exceptions.map((exception) => <div key={exception.id} className="rounded-xl border border-outline-variant/40 bg-surface-grey/40 p-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-label text-label font-bold uppercase text-on-surface">{exception.severity} · {exception.code}</p><p className="mt-1 break-all font-body text-body-sm text-text-grey">{exception.message}</p></div><span className="shrink-0 font-label text-label text-text-grey">{exception.severity === "warning" ? "informational" : exception.resolutionStatus}</span></div>{exception.severity === "blocking" && exception.resolutionStatus === "open" && <p className="mt-3 rounded-lg bg-error/5 p-3 font-body text-body-sm text-error">Blocking error: fix this row in Excel and upload the workbook again. It cannot be approved here.</p>}{exception.severity === "warning" && exception.resolutionStatus === "open" && <div className="mt-3 space-y-2"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><label className="sr-only" htmlFor={`resolution-category-${exception.id}`}>What should happen?</label><select id={`resolution-category-${exception.id}`} required value={resolutionCategories[exception.id] ?? ""} onChange={(event) => setResolutionCategories((current) => ({ ...current, [exception.id]: event.target.value }))} className="min-h-11 rounded-lg border border-outline px-3 font-body text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"><option value="">Choose what to do</option>{MIGRATION_RESOLUTION_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select><label className="sr-only" htmlFor={`resolution-note-${exception.id}`}>Optional note</label><input id={`resolution-note-${exception.id}`} value={resolutionNotes[exception.id] ?? ""} onChange={(event) => setResolutionNotes((current) => ({ ...current, [exception.id]: event.target.value }))} placeholder="Optional note" className="min-h-11 rounded-lg border border-outline px-3 font-body text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" /><button type="button" onClick={() => resolve(exception.id)} disabled={isPending || !resolutionCategories[exception.id]} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-blue px-4 font-label text-label font-bold text-brand-blue disabled:opacity-50">Accept warning</button></div>{resolutionCategories[exception.id] && <p className="font-body text-body-sm text-text-grey">{MIGRATION_RESOLUTION_CATEGORIES.find((category) => category.value === resolutionCategories[exception.id])?.effect ?? "The selected choice will be recorded with this migration."}</p>}</div>}</div>)}</div></div>}
        {!isCommitted && <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-outline-variant/40 pt-6"><LockKeyhole size={18} className="text-text-grey" /><p className="font-body text-body-sm text-text-grey">{canApprove ? openWarnings > 0 ? `Approval will keep ${openWarnings} warning(s) and apply only the documented fallback choices.` : "Approval is required before the opening seed can be committed." : canCommit ? "The migration report is approved and ready to commit." : "Confirmation stays locked until the migration report is approved."}</p>{canApprove && <button type="button" onClick={approve} disabled={isPending} className="ml-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-brand-blue px-5 font-label text-label font-bold text-brand-blue disabled:opacity-50">{isPending && <Loader2 size={18} className="animate-spin" />} Approve migration</button>}{canCommit && <button type="button" onClick={commit} disabled={isPending} className="ml-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-success px-5 font-label text-label font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{isPending && <Loader2 size={18} className="animate-spin" />} Confirm opening seed</button>}</div>}
      </section>}

      {!result?.ok && result?.error && <section className="rounded-2xl border border-error/30 bg-error/5 p-6" role="alert"><p className="font-label text-label font-bold uppercase text-error">Workbook rejected</p><p className="mt-2 whitespace-pre-line font-body text-body-md text-error">{result.error}</p><p className="mt-2 font-body text-body-sm text-text-grey">Fix the listed Excel rows and upload the workbook again.</p></section>}
      {commitMessage && <section className={`rounded-2xl border p-6 ${isCommitted ? "border-success/30 bg-success/5" : "border-error/30 bg-error/5"}`} role="status"><div className="flex items-start gap-3">{isCommitted ? <CheckCircle2 className="text-success" size={22} /> : <AlertTriangle className="text-error" size={22} />}<p className={`font-body text-body-md ${isCommitted ? "text-success" : "text-error"}`}>{commitMessage}</p></div></section>}
    </div>
  );
}
