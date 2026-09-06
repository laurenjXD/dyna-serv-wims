import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "./Card";

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  change?: {
    value: string | number;
    trend: "up" | "down" | "neutral";
    label?: string;
  };
  variant?: "primary" | "secondary" | "success" | "warning" | "error" | "neutral";
  surface?: "office" | "floor";
  className?: string;
}

const iconVariantStyles = {
  primary: "bg-primary/10 text-primary border border-primary/20",
  secondary: "bg-secondary/10 text-secondary border border-secondary/20",
  success: "bg-emerald-50 text-emerald-600 border border-emerald-200",
  warning: "bg-amber-50 text-amber-600 border border-amber-200",
  error: "bg-red-50 text-red-600 border border-red-200",
  neutral: "bg-slate-100 text-slate-600 border border-slate-200",
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  change,
  variant = "primary",
  surface = "office",
  className = "",
}: StatCardProps) {
  const isFloor = surface === "floor";

  return (
    <Card surface={surface} padding="md" className={`relative ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`font-label text-xs font-bold uppercase tracking-wider ${
              isFloor ? "text-white/70" : "text-text-secondary"
            }`}
          >
            {title}
          </p>
          <div
            className={`font-heading text-2xl sm:text-3xl font-bold tracking-tight mt-1.5 ${
              isFloor ? "text-white" : "text-text-primary"
            }`}
          >
            {value}
          </div>
        </div>

        {icon && (
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
              isFloor ? "bg-white/15 text-white border border-white/20" : iconVariantStyles[variant]
            }`}
          >
            {icon}
          </div>
        )}
      </div>

      {(change || subtitle) && (
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-inherit/10">
          {change && (
            <div
              className={`inline-flex items-center gap-1 font-label text-xs font-bold px-2 py-0.5 rounded-full ${
                change.trend === "up"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : change.trend === "down"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {change.trend === "up" ? (
                <TrendingUp className="w-3 h-3" />
              ) : change.trend === "down" ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              <span>{change.value}</span>
            </div>
          )}

          {subtitle && (
            <span
              className={`font-body text-xs ${
                isFloor ? "text-white/60" : "text-text-secondary"
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
