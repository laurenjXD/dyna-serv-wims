"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export const SOA_STATUSES = ["Draft", "Issued", "Paid", "Archived"] as const;
export type SoaStatus = (typeof SOA_STATUSES)[number];

export interface SoaStatusSelectProps {
  value?: string;
  defaultValue?: string;
  onChange?: (newStatus: SoaStatus) => void;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function normalizeSoaStatus(val?: string): SoaStatus {
  if (!val) return "Draft";
  const s = val.toLowerCase().trim();
  if (s === "current period" || s === "draft" || s === "pending") return "Draft";
  if (s === "issued" || s === "ready") return "Issued";
  if (s === "paid" || s === "settled" || s === "closed") return "Paid";
  if (s === "archived" || s === "voided" || s === "void") return "Archived";
  return "Draft";
}

export function getSoaStatusStyles(status: SoaStatus) {
  switch (status) {
    case "Draft":
      return "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100/70 focus:ring-amber-500";
    case "Issued":
      return "bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100/70 focus:ring-blue-500";
    case "Paid":
      return "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/70 focus:ring-emerald-500";
    case "Archived":
      return "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200/70 focus:ring-slate-500";
  }
}

export function SoaStatusSelect({
  value,
  defaultValue = "Draft",
  onChange,
  className = "",
  disabled = false,
  size = "sm",
}: SoaStatusSelectProps) {
  const [internalStatus, setInternalStatus] = useState<SoaStatus>(
    normalizeSoaStatus(value ?? defaultValue)
  );

  const currentStatus = value !== undefined ? normalizeSoaStatus(value) : internalStatus;
  const styleClasses = getSoaStatusStyles(currentStatus);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value as SoaStatus;
    if (value === undefined) {
      setInternalStatus(nextStatus);
    }
    onChange?.(nextStatus);
  };

  const sizeClasses =
    size === "sm"
      ? "h-7 text-xs px-2.5 pr-7 font-semibold"
      : "h-9 text-sm px-3.5 pr-8 font-bold";

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        value={currentStatus}
        onChange={handleChange}
        disabled={disabled}
        aria-label="SOA Status"
        className={`appearance-none cursor-pointer rounded-full border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${sizeClasses} ${styleClasses}`}
      >
        {SOA_STATUSES.map((st) => (
          <option key={st} value={st} className="bg-white text-slate-900 font-normal">
            {st}
          </option>
        ))}
      </select>
      <ChevronDown
        size={size === "sm" ? 12 : 14}
        className="pointer-events-none absolute right-2.5 text-current opacity-70"
        aria-hidden="true"
      />
    </div>
  );
}
