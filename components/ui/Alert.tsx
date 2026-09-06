import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  ArrowRight,
} from "lucide-react";

export type AlertVariant = "error" | "warning" | "success" | "info";

export interface AlertProps {
  variant?: AlertVariant;
  /** 1. What happened */
  title: string;
  /** 2. Why it failed / Additional context */
  description?: React.ReactNode;
  /** 3. Next action / Recovery CTA */
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  onDismiss?: () => void;
  surface?: "office" | "floor";
  className?: string;
  children?: React.ReactNode;
}

const variantConfig: Record<
  AlertVariant,
  {
    icon: typeof AlertCircle;
    officeBorder: string;
    officeBg: string;
    officeText: string;
    officeTitle: string;
    iconColor: string;
  }
> = {
  error: {
    icon: AlertCircle,
    officeBorder: "border-red-200",
    officeBg: "bg-red-50/90",
    officeText: "text-red-700",
    officeTitle: "text-red-900",
    iconColor: "text-error",
  },
  warning: {
    icon: AlertTriangle,
    officeBorder: "border-amber-200",
    officeBg: "bg-amber-50/90",
    officeText: "text-amber-800",
    officeTitle: "text-amber-950",
    iconColor: "text-warning",
  },
  success: {
    icon: CheckCircle2,
    officeBorder: "border-emerald-200",
    officeBg: "bg-emerald-50/90",
    officeText: "text-emerald-800",
    officeTitle: "text-emerald-950",
    iconColor: "text-success",
  },
  info: {
    icon: Info,
    officeBorder: "border-blue-200",
    officeBg: "bg-blue-50/90",
    officeText: "text-blue-800",
    officeTitle: "text-blue-950",
    iconColor: "text-primary",
  },
};

export function Alert({
  variant = "info",
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  onDismiss,
  surface = "office",
  className = "",
  children,
}: AlertProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  const isFloor = surface === "floor";

  const surfaceStyles = isFloor
    ? "bg-white/10 border border-white/20 text-white"
    : `${config.officeBg} ${config.officeBorder} border ${config.officeText}`;

  return (
    <div
      role="alert"
      className={`relative flex items-start gap-3.5 p-4 rounded-xl shadow-2xs ${surfaceStyles} ${className}`}
    >
      <div className="shrink-0 mt-0.5">
        <Icon
          className={`w-5 h-5 ${isFloor ? "text-white" : config.iconColor}`}
          aria-hidden="true"
        />
      </div>

      <div className="flex-1 min-w-0">
        <h4
          className={`font-heading text-sm font-bold tracking-tight ${
            isFloor ? "text-white" : config.officeTitle
          }`}
        >
          {title}
        </h4>

        {(description || children) && (
          <div
            className={`font-body text-xs mt-1 leading-relaxed ${
              isFloor ? "text-white/80" : "text-inherit opacity-90"
            }`}
          >
            {description}
            {children}
          </div>
        )}

        {/* 3. Next Action / Recovery */}
        {(actionLabel && (onAction || actionHref)) && (
          <div className="mt-2.5">
            {actionHref ? (
              <a
                href={actionHref}
                className={`inline-flex items-center gap-1.5 font-label text-xs font-bold uppercase tracking-wider underline hover:opacity-80 transition-opacity ${
                  isFloor ? "text-white" : config.officeTitle
                }`}
              >
                {actionLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            ) : (
              <button
                type="button"
                onClick={onAction}
                className={`inline-flex items-center gap-1.5 font-label text-xs font-bold uppercase tracking-wider underline hover:opacity-80 transition-opacity ${
                  isFloor ? "text-white" : config.officeTitle
                }`}
              >
                {actionLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={`p-1 rounded-md transition-colors ${
            isFloor
              ? "text-white/60 hover:text-white hover:bg-white/10"
              : "text-text-secondary hover:text-text-primary hover:bg-black/5"
          }`}
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
