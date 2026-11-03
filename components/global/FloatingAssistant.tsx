"use client";

import { toUserMessage } from "@/lib/ui/user-messages";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Bot, Send, X } from "@/components/ui/icons";
import { useOfflineStatus } from "@/lib/offline/provider";

type Source = { key: string; title: string; heading: string; version: string; citation: string; href: string };
type Turn = { question: string; answer: string; sources: Source[] };

export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turn, setTurn] = useState<Turn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const { connectivity } = useOfflineStatus();
  const online = connectivity === "online";

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setTurn(null);
        setError(null);
        setQuestion("");
        requestAnimationFrame(() => launcherRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), a[href]',
      )];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    setTurn(null);
    setError(null);
    setQuestion("");
    requestAnimationFrame(() => launcherRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = question.trim();
    if (!value || loading || !online) return;
    setLoading(true);
    setError(null);
    setTurn(null);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value }),
        cache: "no-store",
      });
      const result = await response.json() as { answer?: string; sources?: Source[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "The assistant could not answer right now.");
      setTurn({ question: value, answer: result.answer ?? "I couldn’t verify an answer.", sources: result.sources ?? [] });
      setQuestion("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The assistant could not answer right now.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        aria-label="Open WIMS assistant"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-2 ring-white hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
      >
        <Bot size={25} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/25 sm:bg-transparent" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-title"
            className="fixed inset-x-0 bottom-0 flex max-h-[min(86dvh,760px)] min-h-[min(70dvh,560px)] flex-col rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(680px,calc(100dvh-8rem))] sm:w-[min(420px,calc(100vw-2rem))] sm:rounded-2xl"
          >
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot size={21} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="assistant-title" className="font-semibold text-foreground">WIMS Assistant</h2>
                <p className="text-xs text-muted-foreground">Read-only · Answers from internal manuals</p>
              </div>
              <button ref={closeRef} type="button" aria-label="Close assistant" onClick={close} className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X size={20} /></button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
              <p className="rounded-xl bg-muted p-3 text-sm text-foreground">Ask how to use WIMS. I can’t change records or look up live warehouse data.</p>
              {!online && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">The assistant is unavailable while offline.</p>}
              {turn && <>
                <p className="ml-8 rounded-xl bg-primary/10 p-3 text-sm text-foreground">{turn.question}</p>
                <div className="rounded-xl border border-border p-3 text-sm leading-6 text-foreground">
                  <p className="whitespace-pre-wrap">{turn.answer}</p>
                  {turn.sources.length > 0 && <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manual sources</p>
                    <ul className="space-y-2">{turn.sources.map((source) => <li key={`${source.key}:${source.heading}`}>
                      <Link className="text-primary underline underline-offset-2" href={source.href} onClick={close}>{source.title} · {source.heading} · {source.version}</Link>
                    </li>)}</ul>
                  </div>}
                </div>
              </>}
              {loading && <p role="status" className="text-sm text-muted-foreground">Checking the approved manuals…</p>}
              {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{toUserMessage(error, "The assistant could not answer right now. Try again shortly.")}</p>}
            </div>

            <form onSubmit={submit} className="border-t border-border p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
              <label htmlFor="assistant-question" className="sr-only">Ask the WIMS Assistant</label>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  id="assistant-question"
                  rows={2}
                  maxLength={3000}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={online ? "Ask about a WIMS process…" : "Unavailable offline"}
                  disabled={!online || loading}
                  className="min-h-12 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                />
                <button type="submit" aria-label="Send question" disabled={!question.trim() || loading || !online} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"><Send size={18} /></button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Messages aren’t saved. Don’t include passwords or sensitive personal information.</p>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
