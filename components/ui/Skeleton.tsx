import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  surface?: "office" | "floor";
}

export function Skeleton({
  className = "",
  surface = "office",
  ...props
}: SkeletonProps) {
  const isFloor = surface === "floor";

  return (
    <div
      className={`animate-pulse rounded-lg ${
        isFloor ? "bg-white/10" : "bg-slate-200/80"
      } ${className}`}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
  surface = "office",
}: {
  lines?: number;
  className?: string;
  surface?: "office" | "floor";
}) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          surface={surface}
          className={`h-4 ${i === lines - 1 ? "w-3/4" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({
  className = "",
  surface = "office",
}: {
  className?: string;
  surface?: "office" | "floor";
}) {
  const isFloor = surface === "floor";

  return (
    <div
      className={`p-6 rounded-2xl border space-y-4 ${
        isFloor
          ? "bg-white/10 border-white/20"
          : "bg-surface border-border shadow-elevation-1"
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <Skeleton surface={surface} className="h-5 w-32" />
        <Skeleton surface={surface} className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton surface={surface} className="h-8 w-24" />
      <Skeleton surface={surface} className="h-4 w-48" />
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = "",
  surface = "office",
}: {
  rows?: number;
  cols?: number;
  className?: string;
  surface?: "office" | "floor";
}) {
  const isFloor = surface === "floor";

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${
        isFloor ? "border-white/20 bg-white/10" : "border-border bg-surface shadow-elevation-1"
      } ${className}`}
    >
      <div className={`p-4 border-b ${isFloor ? "border-white/10 bg-white/5" : "border-border bg-slate-50"}`}>
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} surface={surface} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      <div className="p-4 space-y-4">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} surface={surface} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
