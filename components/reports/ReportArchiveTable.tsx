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
} from "lucide-react";
import type { ReportArchiveItem, ReportCategory, ReportFormat } from "./types";
import { REPORT_ARCHIVE_SEED } from "./data/reportsSeedData";

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

  const filteredArchive = archive.filter((item) => {
    const matchesSearch =
      item.reportName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.generatedBy.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFormat = selectedFormat === "ALL" || item.format === selectedFormat;
    const matchesCategory = selectedCategory === "ALL" || item.category === selectedCategory;
    return matchesSearch && matchesFormat && matchesCategory;
  });

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to archive this historical report?")) {
      setArchive((prev) => prev.filter((item) => item.id !== id));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white shadow-sm overflow-hidden">
      {/* ── Header & Toolbar ────────────────────────────────────────────── */}
      <div className="border-b border-slate-100 bg-slate-50/70 p-5 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
              <Archive size={18} className="text-brand-navy" />
              Generated Reports Archive &amp; Audit Trail
            </h3>
            <p className="mt-0.5 font-body text-xs text-text-grey">
              Permanent immutable compliance archive of generated financial statements, audit exports, and SLA reports.
            </p>
          </div>
          <span className="font-mono text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
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
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8.5 w-full sm:w-64 rounded-xl border border-slate-200 bg-white pl-8 pr-3 font-body text-xs text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy shadow-2xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
              {["ALL", "Financial", "Inventory", "Operations", "Settlement"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-lg px-2.5 py-1 transition-all text-[11px] ${
                    selectedCategory === cat ? "bg-white text-brand-navy font-bold shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Format Filter */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 font-label text-xs font-semibold">
              {["ALL", "PDF", "CSV", "XLSX"].map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setSelectedFormat(fmt)}
                  className={`rounded-lg px-2 py-1 uppercase text-[10px] font-bold transition-all ${
                    selectedFormat === fmt ? "bg-brand-navy text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Table Grid ──────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs font-body">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50/70 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
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
          <tbody className="divide-y divide-slate-100 font-body">
            {filteredArchive.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                {/* Report Name */}
                <td className="px-4 py-3 font-semibold text-slate-900">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-brand-navy shrink-0" />
                    <button
                      type="button"
                      onClick={() => onPreviewReport(item)}
                      className="font-mono text-xs font-bold text-brand-navy hover:underline text-left"
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
                        ? "bg-purple-50 text-purple-800 border border-purple-200"
                        : item.category === "Inventory"
                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : item.category === "Settlement"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-slate-100 text-slate-800 border border-slate-200"
                    }`}
                  >
                    {item.category}
                  </span>
                </td>

                {/* Date Range Covered */}
                <td className="px-4 py-3 font-mono text-slate-700">
                  {item.dateRangeCovered}
                </td>

                {/* Generated By */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-bold text-[10px]">
                      {item.generatedBy.name.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-[11px] leading-none">{item.generatedBy.name}</p>
                      <p className="text-[10px] text-text-grey">{item.generatedBy.role}</p>
                    </div>
                  </div>
                </td>

                {/* Generated At */}
                <td className="px-4 py-3 font-body text-slate-600">
                  <span className="flex items-center gap-1">
                    <Clock size={11} className="text-slate-400" />
                    {item.generatedAt}
                  </span>
                </td>

                {/* File Size & Format */}
                <td className="px-4 py-3 font-mono text-slate-700">
                  <span className="inline-flex items-center gap-1 font-bold">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-brand-navy">
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
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : item.status === "Processing"
                        ? "bg-amber-50 text-amber-800 border border-amber-200"
                        : "bg-rose-50 text-rose-800 border border-rose-200"
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
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-brand-navy hover:bg-slate-50 shadow-2xs"
                      title="Download File"
                    >
                      <Download size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onShareReport(item)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-2xs"
                      title="Share / Email Report"
                    >
                      <Share2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 shadow-2xs"
                      title="Archive Record"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
