"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export interface TablePaginationProps {
  // Option 1: 0-indexed TanStack style
  pageIndex?: number;
  pageCount?: number;
  totalCount?: number;
  canPreviousPage?: boolean;
  canNextPage?: boolean;

  // Option 2: 1-indexed style
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;

  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function TablePagination({
  pageIndex,
  pageCount,
  totalCount,
  canPreviousPage,
  canNextPage,
  currentPage: propCurrentPage,
  totalPages: propTotalPages,
  totalItems: propTotalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
  className = "",
}: TablePaginationProps) {
  // Determine indexing mode
  const is0Indexed = pageIndex !== undefined;
  const currentPage = is0Indexed ? pageIndex + 1 : (propCurrentPage ?? 1);
  const totalItems = totalCount !== undefined ? totalCount : (propTotalItems ?? 0);
  const totalPages =
    pageCount !== undefined
      ? Math.max(pageCount, 1)
      : Math.max(propTotalPages ?? (Math.ceil(totalItems / (pageSize || 1)) || 1), 1);

  const hasPrev = canPreviousPage !== undefined ? canPreviousPage : currentPage > 1;
  const hasNext = canNextPage !== undefined ? canNextPage : currentPage < totalPages;

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handlePageClick = (p1Indexed: number) => {
    if (is0Indexed) {
      onPageChange(p1Indexed - 1);
    } else {
      onPageChange(p1Indexed);
    }
  };

  // Generate page numbers to display with smart ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, "...", totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
      }
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 text-xs font-body text-slate-600 dark:text-zinc-400 ${className}`}
    >
      {/* ── Left: Range Information & Page Size Selector ──────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs">
          Showing <strong className="text-slate-900 dark:text-zinc-100">{startItem}</strong> to{" "}
          <strong className="text-slate-900 dark:text-zinc-100">{endItem}</strong> of{" "}
          <strong className="text-slate-900 dark:text-zinc-100">{totalItems}</strong> entries
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 font-label text-xs">
            <span className="text-text-grey hidden sm:inline">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                onPageSizeChange(newSize);
                if (is0Indexed) {
                  onPageChange(0);
                } else {
                  onPageChange(1);
                }
              }}
              className="h-8 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 font-mono text-xs font-bold text-slate-800 dark:text-zinc-200 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy shadow-2xs"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} rows
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Right: Navigation Controls ─────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <button
          type="button"
          onClick={() => handlePageClick(1)}
          disabled={!hasPrev}
          aria-label="First page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors"
        >
          <ChevronsLeft size={15} />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={!hasPrev}
          aria-label="Previous page"
          className="flex h-8 min-w-[32px] px-2 items-center justify-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-label text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Prev</span>
        </button>

        {/* Page Number Pills (Desktop) */}
        <div className="hidden sm:flex items-center gap-1">
          {getPageNumbers().map((page, idx) => {
            if (page === "...") {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-mono">
                  ...
                </span>
              );
            }
            const pageNum = Number(page);
            const isCurrent = pageNum === currentPage;
            return (
              <button
                key={`page-btn-${pageNum}-${idx}`}
                type="button"
                onClick={() => handlePageClick(pageNum)}
                className={`flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 font-mono text-xs font-bold transition-all ${
                  isCurrent
                    ? "bg-brand-navy dark:bg-blue-600 text-white shadow-2xs"
                    : "border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 shadow-2xs"
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Current Page Badge (Mobile) */}
        <span className="sm:hidden px-2 font-mono text-xs font-bold text-slate-900 dark:text-zinc-100">
          {currentPage} / {totalPages || 1}
        </span>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={!hasNext}
          aria-label="Next page"
          className="flex h-8 min-w-[32px] px-2 items-center justify-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-label text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={14} />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => handlePageClick(totalPages)}
          disabled={!hasNext}
          aria-label="Last page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors"
        >
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}
