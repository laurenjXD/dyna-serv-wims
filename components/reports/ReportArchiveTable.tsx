"use client";

import React, { useState } from "react";
import {
  FileText,
  Download,
  Search,
  Filter,
  Share2,
  Trash2,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Archive,
  User,
  Clock,
  ExternalLink,
} from "lucide-react";
import type { ReportArchiveItem, ReportCategory, ReportFormat } from "./types";
import { REPORT_ARCHIVE_SEED } from "./data/reportsSeedData";
import { TablePagination } from "@/components/ui/TablePagination";

interface ReportArchiveTableProps {
  onDownloadReport: (item: ReportArchiveItem) => void;
  onShareReport: (item: ReportArchiveItem) => void;
  onPreviewReport: (item: ReportArchiveItem) => void;
}

export function ReportArchiveTable({
  onDownloadReport,
  onShareReport,
  onPreviewReport,
}: ReportArchiveTableProps) {
  const [archive, setArchive] = useState<ReportArchiveItem[]>(REPORT_ARCHIVE_SEED);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);

  const filteredArchive = archive.filter((item) => {
    const matchesSearch =
      item.reportName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.generatedBy.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFormat = selectedFormat === "ALL" || item.format === selectedFormat;
    const matchesCategory = selectedCategory === "ALL" || item.category === selectedCategory;
    return matchesSearch && matchesFormat && matchesCategory;
  });

  const totalCount = filteredArchive.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedArchive = filteredArchive.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize
  );

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPageIndex(0);
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setPageIndex(0);
  };

  const handleFormatChange = (fmt: string) => {
    setSelectedFormat(fmt);
    setPageIndex(0);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to archive this historical report?")) {
      setArchive((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const getFormatBadge = (format: ReportFormat) => {
    if (format === "PDF") {
      return "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800";
    }
    if (format === "XLSX") {
      return "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800";
    }
    return "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800";
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-sm overflow-hidden">
      {/* ── Header & Toolbar ────────────────────────────────────────────── */}
      <div className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/50 p-5 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h3 className="font-heading text-title-md font-bold text-brand-navy dark:text-zinc-100 flex items-center gap-2">
              <Archive size={18} className="text-brand-navy dark:text-blue-400" />
              Generated Reports Archive &amp; Audit Trail
            </h3>
            <p className="mt-0.5 font-body text-xs text-text-grey">
              Permanent compliance archive of generated financial statements, audits, and SLA reports.
            </p>
          </div>
          <span className="font-mono text-xs font-bold text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 shadow-2xs">
            {filteredArchive.length} Archived Artifacts
          </span>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Search Bar */}
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search reports or operators..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-8.5 w-full sm:w-64 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-8 pr-3 font-body text-xs text-brand-navy dark:text-zinc-100 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy shadow-2xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 font-label text-xs font-semibold">
              {["ALL", "Financial", "Inventory", "Operations", "Settlement"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryChange(cat)}
                  className={`rounded-lg px-2.5 py-1 transition-all text-[11px] ${
                    selectedCategory === cat
                      ? "bg-white dark:bg-zinc-700 text-brand-navy dark:text-white font-bold shadow-2xs"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Format Filter */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 font-label text-xs font-semibold">
              {["ALL", "PDF", "CSV", "XLSX"].map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => handleFormatChange(fmt)}
                  className={`rounded-lg px-2 py-1 uppercase text-[10px] font-bold transition-all ${
                    selectedFormat === fmt
                      ? "bg-brand-navy dark:bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 1. Desktop Table Grid (>= 1024px) ──────────────────────────────────── */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs font-body">
          <thead>
            <tr className="border-b border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/50 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              <th className="px-4 py-3">Report Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Date Range</th>
              <th className="px-4 py-3">Generated By</th>
              <th className="px-4 py-3">Generated At</th>
              <th className="px-4 py-3">Size &amp; Format</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-body">
            {pagedArchive.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-text-grey italic">
                  No generated reports found matching criteria.
                </td>
              </tr>
            ) : (
              pagedArchive.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/50 transition-colors">
                {/* Report Name */}
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-zinc-100">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-brand-navy dark:text-blue-400 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onPreviewReport(item)}
                      className="font-mono text-xs font-bold text-brand-navy dark:text-blue-400 hover:underline text-left"
                    >
                      {item.reportName}
                    </button>
                  </div>
                </td>

                {/* Category */}
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-label text-[10px] font-bold ${
                      item.category === "Financial"
                        ? "bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                        : item.category === "Inventory"
                        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        : item.category === "Settlement"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                        : "bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
                    }`}
                  >
                    {item.category}
                  </span>
                </td>

                {/* Date Range Covered */}
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-zinc-300">
                  {item.dateRangeCovered}
                </td>

                {/* Generated By */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-[10px]">
                      {item.generatedBy.name.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-zinc-100 text-[11px] leading-none">{item.generatedBy.name}</p>
                      <p className="text-[10px] text-text-grey">{item.generatedBy.role}</p>
                    </div>
                  </div>
                </td>

                {/* Generated At */}
                <td className="px-4 py-3 font-body text-slate-600 dark:text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Clock size={11} className="text-slate-400" />
                    {item.generatedAt}
                  </span>
                </td>

                {/* File Size & Format */}
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-zinc-300">
                  <span className="inline-flex items-center gap-1 font-bold">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${getFormatBadge(item.format)}`}>
                      {item.format}
                    </span>
                    <span>{item.fileSizeFormatted}</span>
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-[10px] font-bold ${
                      item.status === "Ready"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                        : item.status === "Processing"
                        ? "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                        : "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                    }`}
                  >
                    {item.status === "Ready" && <CheckCircle2 size={11} />}
                    {item.status === "Processing" && <RefreshCw size={11} className="animate-spin" />}
                    {item.status}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onDownloadReport(item)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-brand-navy dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-zinc-700 shadow-2xs"
                      title="Download File"
                    >
                      <Download size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onShareReport(item)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 shadow-2xs"
                      title="Share / Email Report"
                    >
                      <Share2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 shadow-2xs"
                      title="Archive Record"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── 2. Mobile Chronological Card Feed (< 1024px) ───────────────────────── */}
      <div className="block lg:hidden divide-y divide-slate-100 dark:divide-zinc-800 p-3 space-y-3">
        {pagedArchive.length === 0 ? (
          <div className="p-8 text-center text-xs text-text-grey italic">
            No generated reports found matching criteria.
          </div>
        ) : (
          pagedArchive.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3"
          >
            {/* Top Row: File Name + Format Badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className={`inline-block rounded px-2 py-0.5 font-mono text-[10px] font-bold ${getFormatBadge(item.format)}`}>
                  {item.format} · {item.fileSizeFormatted}
                </span>
                <h4
                  onClick={() => onPreviewReport(item)}
                  className="font-mono text-xs font-bold text-slate-900 dark:text-zinc-100 break-all hover:text-brand-navy cursor-pointer"
                >
                  {item.reportName}
                </h4>
              </div>

              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-[10px] font-bold shrink-0 ${
                  item.status === "Ready"
                    ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {item.status}
              </span>
            </div>

            {/* Metadata Row */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-body text-text-grey pt-2 border-t border-slate-100 dark:border-zinc-800">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-grey">Horizon:</span>
                <p className="font-mono text-slate-800 dark:text-zinc-200">{item.dateRangeCovered}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-text-grey">By:</span>
                <p className="font-bold text-slate-800 dark:text-zinc-200">{item.generatedBy.name} ({item.generatedAt})</p>
              </div>
            </div>

            {/* Glove-Friendly Action Dock (Min 48px Touch Targets) */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                type="button"
                onClick={() => onPreviewReport(item)}
                className="flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-label text-xs font-bold text-slate-700 dark:text-zinc-200 active:scale-98"
              >
                <FileText size={16} />
                <span>Preview</span>
              </button>

              <button
                type="button"
                onClick={() => onShareReport(item)}
                className="flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-label text-xs font-bold text-slate-700 dark:text-zinc-200 active:scale-98"
              >
                <Share2 size={16} />
                <span>Share</span>
              </button>

              <button
                type="button"
                onClick={() => onDownloadReport(item)}
                className="flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl bg-brand-navy dark:bg-blue-600 text-white font-label text-xs font-bold shadow-sm active:scale-98"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>
          </div>
        ))
        )}
      </div>

      {/* ── Table Pagination ─────────────────────────────────────────────── */}
      <TablePagination
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalCount={totalCount}
        pageCount={pageCount}
        canPreviousPage={pageIndex > 0}
        canNextPage={pageIndex < pageCount - 1}
        onPageChange={(newPageIndex) => setPageIndex(newPageIndex)}
        onPageSizeChange={(newPageSize) => {
          setPageSize(newPageSize);
          setPageIndex(0);
        }}
        pageSizeOptions={[5, 10, 20]}
      />
    </div>
  );
}
