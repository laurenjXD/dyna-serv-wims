"use client";

import React from "react";
import Link from "next/link";
import {
  PackageCheck,
  ListChecks,
  ArrowLeftRight,
  FlaskConical,
  PackagePlus,
  Send,
  Wifi,
  WifiOff,
  Clock,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

export type SmartWorkItem = {
  id: string;
  title: string;
  category: "trading_pick" | "vmi_restock" | "inbound_wrr" | "inspection";
  priority: "urgent" | "high" | "normal";
  slaLabel: string;
  actionUrl: string;
  actionLabel: string;
  countBadge?: string;
};

const QUICK_ACTIONS = [
  { href: "/receiving/new", label: "Receive Shipment", icon: PackagePlus, desc: "Log Inbound WRR" },
  { href: "/transfers/new", label: "New Transfer", icon: ArrowLeftRight, desc: "Move Stock / Bin" },
  { href: "/outgoing", label: "Pick Lists", icon: Send, desc: "Execute Pick Runs" },
  { href: "/inspection", label: "Inspection Queue", icon: FlaskConical, desc: "QC & Quarantine" },
] as const;

export function FloorLanding({
  firstName,
  greeting,
  dateString,
  openWrrs,
  openPickLists,
  pendingTransfers,
  openInspections,
  isOnline = true,
  pendingSyncCount = 0,
  workQueue = [],
}: {
  firstName: string;
  greeting: string;
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  openInspections: number;
  isOnline?: boolean;
  pendingSyncCount?: number;
  workQueue?: SmartWorkItem[];
}) {
  const defaultWorkQueue: SmartWorkItem[] = workQueue.length > 0 ? workQueue : [
    {
      id: "wq-1",
      title: "Trading Pick #PL-2026-089 (Air Filters)",
      category: "trading_pick",
      priority: "urgent",
      slaLabel: "15 min SLA left",
      actionUrl: "/outgoing",
      actionLabel: "Start Pick",
      countBadge: "12 Lines",
    },
    {
      id: "wq-2",
      title: "Inbound WRR #WRR-1044 Pallet Putaway",
      category: "inbound_wrr",
      priority: "high",
      slaLabel: "Dock Bay 2",
      actionUrl: "/receiving",
      actionLabel: "Putaway",
      countBadge: "8 Pallets",
    },
    {
      id: "wq-3",
      title: "VMI Buffer Restock Aisle 04-B (Seals)",
      category: "vmi_restock",
      priority: "normal",
      slaLabel: "Min threshold reached",
      actionUrl: "/transfers",
      actionLabel: "Transfer",
      countBadge: "4 Bins",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      {/* ── Header: Greeting & Status ───────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-4 sm:p-5 shadow-elevation-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-label text-xs font-bold uppercase tracking-wider text-brand-navy">
              Floor Terminal
            </span>
          </div>
          <h1 className="mt-1 font-heading text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
            Good {greeting}, {firstName}
          </h1>
          <p className="font-body text-xs sm:text-sm text-text-grey">{dateString}</p>
        </div>

        {/* Sync Status Badge */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-label text-xs font-bold text-slate-700">
          {isOnline ? (
            <>
              <Wifi size={14} className="text-status-available shrink-0" />
              <span>{pendingSyncCount > 0 ? `${pendingSyncCount} Syncing` : "Online"}</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-amber-600 shrink-0" />
              <span className="text-amber-700">Offline ({pendingSyncCount})</span>
            </>
          )}
        </div>
      </header>

      {/* ── Shift Overview: 4 Clean Elevated Metric Cards ───────────────────── */}
      <section aria-label="Shift overview" data-testid="landing-task-counts" className="space-y-2.5">
        <h2 className="font-label text-xs font-bold uppercase tracking-wider text-text-grey">
          Shift Overview
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Card 1: Open WRRs */}
          <Link
            href="/receiving"
            data-testid="floor-card-wrrs"
            className="group flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1 transition-all hover:border-brand-navy/30 hover:shadow-elevation-2 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <PackageCheck size={20} />
              </span>
              <span className="font-heading text-2xl sm:text-3xl font-bold text-on-surface">
                {openWrrs}
              </span>
            </div>
            <div className="mt-3">
              <p className="font-body text-sm sm:text-base font-bold text-on-surface">Inbound WRRs</p>
              <p className="font-body text-xs text-text-grey">Awaiting intake</p>
            </div>
          </Link>

          {/* Card 2: Active Picks */}
          <Link
            href="/outgoing"
            data-testid="floor-card-picks"
            className="group flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1 transition-all hover:border-brand-navy/30 hover:shadow-elevation-2 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-royal-blue border border-blue-200">
                <ListChecks size={20} />
              </span>
              <span className="font-heading text-2xl sm:text-3xl font-bold text-on-surface">
                {openPickLists}
              </span>
            </div>
            <div className="mt-3">
              <p className="font-body text-sm sm:text-base font-bold text-on-surface">Active Picks</p>
              <p className="font-body text-xs text-text-grey">Pick runs ready</p>
            </div>
          </Link>

          {/* Card 3: Pending Transfers */}
          <Link
            href="/transfers"
            data-testid="floor-card-transfers"
            className="group flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1 transition-all hover:border-brand-navy/30 hover:shadow-elevation-2 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 border border-sky-200">
                <ArrowLeftRight size={20} />
              </span>
              <span className="font-heading text-2xl sm:text-3xl font-bold text-on-surface">
                {pendingTransfers}
              </span>
            </div>
            <div className="mt-3">
              <p className="font-body text-sm sm:text-base font-bold text-on-surface">Transfers</p>
              <p className="font-body text-xs text-text-grey">Bin moves</p>
            </div>
          </Link>

          {/* Card 4: Open Inspections */}
          <Link
            href="/inspection"
            data-testid="floor-card-inspections"
            className="group flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1 transition-all hover:border-brand-navy/30 hover:shadow-elevation-2 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-status-available border border-emerald-200">
                <FlaskConical size={20} />
              </span>
              <span className="font-heading text-2xl sm:text-3xl font-bold text-on-surface">
                {openInspections}
              </span>
            </div>
            <div className="mt-3">
              <p className="font-body text-sm sm:text-base font-bold text-on-surface">Inspections</p>
              <p className="font-body text-xs text-text-grey">QC cases</p>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Quick Actions Grid ─────────────────────────────────────────────── */}
      <section aria-label="Quick actions" data-testid="landing-quick-actions" className="space-y-2.5">
        <h2 className="font-label text-xs font-bold uppercase tracking-wider text-text-grey">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-3.5 shadow-elevation-1 transition-all hover:border-brand-navy/30 hover:bg-slate-50/70 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-brand-navy">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <span className="block font-body text-xs sm:text-sm font-bold text-on-surface truncate">
                  {label}
                </span>
                <span className="block font-body text-[11px] text-text-grey truncate">
                  {desc}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Priority Work Queue ────────────────────────────────────────────── */}
      <section aria-label="Priority work queue" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-label text-xs font-bold uppercase tracking-wider text-text-grey">
            Priority Work Queue
          </h2>
          <span className="font-label text-xs font-semibold text-text-grey">Oldest First</span>
        </div>

        <div className="space-y-2.5">
          {defaultWorkQueue.map((item) => (
            <Link
              key={item.id}
              href={item.actionUrl}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1 transition-all hover:border-brand-navy/30 hover:shadow-elevation-2 active:scale-[0.98]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {item.priority === "urgent" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-label text-[11px] font-bold uppercase text-rose-700 border border-rose-200">
                      <AlertTriangle size={11} /> URGENT
                    </span>
                  )}
                  {item.priority === "high" && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 font-label text-[11px] font-bold uppercase text-amber-700 border border-amber-200">
                      HIGH
                    </span>
                  )}
                  {item.priority === "normal" && (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 font-label text-[11px] font-bold uppercase text-brand-royal-blue border border-blue-200">
                      NORMAL
                    </span>
                  )}
                  <span className="flex items-center gap-1 font-mono text-xs text-text-grey">
                    <Clock size={12} /> {item.slaLabel}
                  </span>
                  {item.countBadge && (
                    <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {item.countBadge}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-body text-sm sm:text-base font-bold text-on-surface group-hover:text-brand-navy transition-colors">
                  {item.title}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-navy px-3 py-2 font-label text-xs sm:text-sm font-bold text-surface-white shadow-sm transition-transform group-hover:scale-105">
                <span>{item.actionLabel}</span>
                <ChevronRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Primary Action: View All Open Work ───────────────────────────────── */}
      <div className="pt-2">
        <Link
          href="/receiving"
          data-testid="landing-work-queue-cta"
          className="flex h-14 sm:h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-heading text-sm sm:text-base font-bold uppercase tracking-wider text-surface-white shadow-md transition-all hover:bg-primary-hover active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-primary/20"
        >
          <span>View All Open Work</span>
          <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  );
}
