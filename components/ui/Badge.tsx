import React from "react";

export type BadgeVariant =
  | "primary"
  | "secondary"
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "outline";

export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: "bg-primary/10 text-primary border border-primary/20",
  secondary: "bg-secondary/10 text-secondary border border-secondary/20",
  neutral: "bg-slate-100 text-slate-700 border border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border border-amber-200",
  error: "bg-red-50 text-red-700 border border-red-200",
  outline: "bg-transparent text-text-secondary border border-border",
};

const dotVariantStyles: Record<BadgeVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  neutral: "bg-slate-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  outline: "bg-slate-400",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "text-[11px] px-2 py-0.5 gap-1 font-semibold",
  md: "text-xs px-2.5 py-1 gap-1.5 font-bold",
  lg: "text-sm px-3 py-1.5 gap-2 font-bold",
};

export function Badge({
  variant = "neutral",
  size = "md",
  dot = false,
  icon,
  children,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-label tracking-wide uppercase transition-colors select-none ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotVariantStyles[variant]}`}
          aria-hidden="true"
        />
      )}
      {icon && <span className="inline-flex shrink-0 items-center">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
