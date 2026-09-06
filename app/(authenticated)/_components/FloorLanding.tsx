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
  Layers,
  Sparkles,
  ArrowRight,
  ShieldAlert,
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
    <div className="flex min-h-screen flex-col gap-6 bg-gradient-to-b from-[#001845] via-[#002060] to-[#001438] px-4 py-6 text-white sm:px-6">
      {/* ── Header: Greeting & Connectivity Status ──────────────────────────── */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-label text-xs font-bold uppercase tracking-wider text-blue-200">
              Floor Terminal Active
            </span>
          </div>
          <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Good {greeting}, {firstName}
          </h1>
          <p className="mt-0.5 font-body text-body-md text-white/70">{dateString}</p>
        </div>

        {/* Sync Status Badge */}
        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-3.5 py-2 backdrop-blur-md">
          {isOnline ? (
            <>
              <Wifi size={16} className="text-emerald-400" />
              <div className="text-right">
                <span className="block font-label text-xs font-bold text-white">Online</span>
                <span className="block font-mono text-[11px] text-emerald-300">
                  {pendingSyncCount > 0 ? `${pendingSyncCount} pending` : "Synced"}
                </span>
              </div>
            </>
          ) : (
            <>
              <WifiOff size={16} className="text-amber-400" />
              <div className="text-right">
                <span className="block font-label text-xs font-bold text-amber-300">Offline</span>
                <span className="block font-mono text-[11px] text-amber-200">
                  {pendingSyncCount} queued
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Shift Overview: 4 Large Glove-Friendly Task Cards ───────────────── */}
      <section aria-label="Shift overview" data-testid="landing-task-counts" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-label text-body-md font-bold uppercase tracking-wider text-blue-200">
            Shift Task Queues
          </h2>
          <span className="font-mono text-xs text-white/60">Live Updates</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Card 1: Open WRRs */}
          <Link
            href="/receiving"
            data-testid="floor-card-wrrs"
            className="group relative flex min-h-[96px] flex-col justify-between rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-white/[0.04] p-4 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <PackageCheck size={20} strokeWidth={2.2} />
              </span>
              <span className="font-heading text-3xl font-extrabold text-white">
                {openWrrs}
              </span>
            </div>
            <div className="mt-3">
              <p className="font-body text-body-md font-bold text-white">Inbound WRRs</p>
              <p className="font-body text-xs text-white/70">Awaiting intake</p>
            </div>
          </Link>

          {/* Card 2: Active Picks */}
          <Link
            href="/outgoing"
            data-testid="floor-card-picks"
            className="group relative flex min-h-[96px] flex-col justify-between rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-white/[0.04] p-4 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
                <ListChecks size={20} strokeWidth={2.2} />
              </span>
              <span className="font-heading text-3xl font-extrabold text-white">
                {openPickLists}
              </span>
            </div>
            <div className="mt-3">
              <p className="font-body text-body-md font-bold text-white">Active Picks</p>
              <p className="font-body text-xs text-white/70">Pick runs active</p>
            </div>
          </Link>

          {/* Card 3: Pending Transfers */}
          <Link
            href="/transfers"
            data-testid="floor-card-transfers"
            className="group relative flex min-h-[96px] flex-col justify-between rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-white/[0.04] p-4 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30">
                <ArrowLeftRight size={20} strokeWidth={2.2} />
              </span>
              <span className="font-heading text-3xl font-extrabold text-white">
                {pendingTransfers}
              </span>
            </div>
            <div className="mt-3">
              <p className="font-body text-body-md font-bold text-white">Transfers</p>
              <p className="font-body text-xs text-white/70">Bin & bay moves</p>
            </div>
          </Link>

          {/* Card 4: Open Inspections */}
          <Link
            href="/inspection"
            data-testid="floor-card-inspections"
            className="group relative flex min-h-[96px] flex-col justify-between rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-white/[0.04] p-4 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <FlaskConical size={20} strokeWidth={2.2} />
              </span>
              <span className="font-heading text-3xl font-extrabold text-white">
                {openInspections}
              </span>
            </div>
            <div className="mt-3">
              <p className="font-body text-body-md font-bold text-white">Inspections</p>
              <p className="font-body text-xs text-white/70">QC quarantine</p>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Quick Actions Grid (Accessible 56px+ Targets) ───────────────────── */}
      <section aria-label="Quick actions" data-testid="landing-quick-actions" className="space-y-3">
        <h2 className="font-label text-body-md font-bold uppercase tracking-wider text-blue-200">
          Quick Floor Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.08] p-3.5 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <span className="block font-body text-body-md font-bold text-white truncate">
                  {label}
                </span>
                <span className="block font-body text-xs text-white/60 truncate">
                  {desc}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Priority Work Queue (SLA & Sequence Sorted) ────────────────────── */}
      <section aria-label="Priority work queue" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-label text-body-md font-bold uppercase tracking-wider text-blue-200">
            Priority Work Queue
          </h2>
          <span className="font-label text-xs font-semibold text-blue-300">Oldest First</span>
        </div>

        <div className="space-y-2.5">
          {defaultWorkQueue.map((item) => (
            <Link
              key={item.id}
              href={item.actionUrl}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15 active:scale-[0.98]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {item.priority === "urgent" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-0.5 font-label text-xs font-bold uppercase text-rose-300 border border-rose-500/30">
                      <AlertTriangle size={12} /> URGENT
                    </span>
                  )}
                  {item.priority === "high" && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 font-label text-xs font-bold uppercase text-amber-300 border border-amber-500/30">
                      HIGH
                    </span>
                  )}
                  {item.priority === "normal" && (
                    <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2.5 py-0.5 font-label text-xs font-bold uppercase text-blue-300 border border-blue-500/30">
                      NORMAL
                    </span>
                  )}
                  <span className="flex items-center gap-1 font-mono text-xs text-white/70">
                    <Clock size={12} /> {item.slaLabel}
                  </span>
                  {item.countBadge && (
                    <span className="font-mono text-xs text-white/60 bg-white/10 px-2 py-0.5 rounded">
                      {item.countBadge}
                    </span>
                  )}
                </div>
                <p className="mt-2 font-body text-body-md font-bold text-white group-hover:text-blue-200 transition-colors">
                  {item.title}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary/90 px-3.5 py-2 font-label text-body-md font-bold text-white shadow-sm transition-transform group-hover:scale-105">
                <span>{item.actionLabel}</span>
                <ChevronRight size={16} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Primary Bottom CTA: View All Open Work (Full 64px) ──────────────── */}
      <div className="sticky bottom-4 mt-auto pt-2">
        <Link
          href="/receiving"
          data-testid="landing-work-queue-cta"
          className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-heading text-lg font-bold uppercase tracking-wider text-white shadow-xl transition-all hover:bg-primary-hover active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-white/50"
        >
          <span>View All Open Work</span>
          <ArrowRight size={20} />
        </Link>
      </div>
    </div>
  );
}
