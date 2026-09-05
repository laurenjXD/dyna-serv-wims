"use client";

import React, { useState } from "react";
import {
  FileText,
  Download,
  Search,
  Share2,
  Archive,
  User,
  Clock,
  ExternalLink,
} from "lucide-react";
import type { ReportArchiveItem, ReportCategory, ReportFormat } from "./types";
import { TablePagination } from "@/components/ui/TablePagination";

interface ReportArchiveTableProps {
  initialData?: ReportArchiveItem[];
  onDownloadReport: (item: ReportArchiveItem) => void;
  onShareReport: (item: ReportArchiveItem) => void;
  onPreviewReport: (item: ReportArchiveItem) => void;
}

export function ReportArchiveTable({
  initialData,
  onDownloadReport,
  onShareReport,
  onPreviewReport,
}: ReportArchiveTableProps) {
  const [archive] = useState<ReportArchiveItem[]>(initialData || []);
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

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-5 shadow-sm space-y-4">
      {/* ── Table Header & Unified Filter Controls ────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
              <Archive size={18} className="text-brand-navy" />
              Generated Report Archive &amp; Audit Log
            </h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
              IMMUTABLE STORE
            </span>
          </div>
          <p className="mt-0.5 font-body text-xs text-text-grey">
            Permanent archive of all system-generated and scheduled financial and operational audit artifacts.
          </p>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Report or Author..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 font-body text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setPageIndex(0);
            }}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-800 focus:border-brand-navy focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            <option value="Financial">Financial</option>
            <option value="Settlement">Settlement</option>
            <option value="Operations">Operations</option>
            <option value="Inventory">Inventory</option>
          </select>

          {/* Format Filter */}
          <select
            value={selectedFormat}
            onChange={(e) => {
              setSelectedFormat(e.target.value);
              setPageIndex(0);
            }}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-800 focus:border-brand-navy focus:outline-none"
          >
            <option value="ALL">All Formats</option>
            <option value="PDF">PDF Only</option>
            <option value="CSV">CSV Only</option>
            <option value="XLSX">XLSX Only</option>
          </select>
        </div>
      </div>

      {/* ── 📱 Mobile Card Feed (< 1024px) ─────────────────────────────────── */}
      <div className="block lg:hidden space-y-3">
        {pagedArchive.length > 0 ? (
          pagedArchive.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-brand-navy shrink-0 font-mono text-xs font-bold">
                    {item.format}
                  </div>
                  <div>
                    <h4 className="font-heading text-xs font-bold text-brand-navy truncate max-w-[200px]">
                      {item.reportName}
                    </h4>
                    <span className="font-mono text-[10px] text-text-grey">
                      {item.fileSizeFormatted} · {item.category}
                    </span>
                  </div>
                </div>

                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  {item.status}
                </span>
              </div>

              {/* Author & Timestamp Row */}
              <div className="flex items-center justify-between text-[11px] text-text-grey font-body bg-slate-50 p-2 rounded-xl">
                <div className="flex items-center gap-1.5">
                  <User size={12} className="text-slate-400" />
                  <span>{item.generatedBy.name}</span>
                </div>
                <div className="flex items-center gap-1 font-mono">
                  <Clock size={12} className="text-slate-400" />
                  <span>{item.generatedAt}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onPreviewReport(item)}
                  className="flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white font-label text-xs font-bold text-slate-700 shadow-2xs"
                >
                  <ExternalLink size={13} />
                  <span>View</span>
                </button>

                <button
                  type="button"
                  onClick={() => onShareReport(item)}
                  className="flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white font-label text-xs font-bold text-slate-700 shadow-2xs"
                >
                  <Share2 size={13} />
                  <span>Share</span>
                </button>

                <button
                  type="button"
                  onClick={() => onDownloadReport(item)}
                  className="flex min-h-[40px] items-center justify-center gap-1 rounded-xl bg-brand-navy font-label text-xs font-bold text-white shadow-2xs"
                >
                  <Download size={13} />
                  <span>Save</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-text-grey">
            No archived reports match your query.
          </div>
        )}
      </div>

      {/* ── 🖥️ Desktop Table View (>= 1024px) ──────────────────────────────── */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
              <th className="px-4 py-3">Report Document</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Period Covered</th>
              <th className="px-4 py-3">Generated By</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-body text-xs">
            {pagedArchive.length > 0 ? (
              pagedArchive.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-brand-navy font-mono font-bold text-[10px]">
                        {item.format}
                      </div>
                      <span className="font-bold text-slate-900 block">{item.reportName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                        item.category === "Financial"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : item.category === "Settlement"
                          ? "bg-blue-50 text-blue-800 border border-blue-200"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 text-[11px]">
                    {item.dateRangeCovered}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-slate-800">
                      <User size={13} className="text-slate-400" />
                      <span>{item.generatedBy.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-text-grey text-[11px]">
                    {item.generatedAt}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700 text-[11px]">
                    {item.fileSizeFormatted}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPreviewReport(item)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 font-label text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                        title="Preview PDF"
                      >
                        <ExternalLink size={12} className="text-slate-400" />
                        <span>View</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onShareReport(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
                        title="Copy Secure Link"
                      >
                        <Share2 size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDownloadReport(item)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-navy px-2.5 font-label text-xs font-bold text-white hover:bg-brand-navy/90 transition-colors shadow-2xs"
                        title="Download Artifact"
                      >
                        <Download size={12} />
                        <span>Save</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-text-grey">
                  No archived report files found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Standard Pagination Bar ────────────────────────────────────────── */}
      <TablePagination
        currentPage={pageIndex + 1}
        totalPages={pageCount}
        pageSize={pageSize}
        totalItems={totalCount}
        onPageChange={(page) => setPageIndex(page - 1)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPageIndex(0);
        }}
        pageSizeOptions={[5, 10, 20]}
        className="border-t border-slate-100 pt-2"
      />
    </div>
  );
}
