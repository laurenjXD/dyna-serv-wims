import React, { forwardRef } from "react";
import { AlertCircle } from "lucide-react";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  showCount?: boolean;
  surface?: "office" | "floor";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helperText,
      error,
      showCount = false,
      surface = "office",
      className = "",
      id,
      disabled,
      maxLength,
      value,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    const isFloor = surface === "floor";
    const currentLength = typeof value === "string" ? value.length : 0;

    const baseStyles = isFloor
      ? "bg-white/15 border-white/20 text-white placeholder:text-white/40 focus:border-white focus:ring-white/30"
      : "bg-surface border-border text-text-primary placeholder:text-text-secondary/60 focus:border-primary focus:ring-primary/20";

    const errorStyles = error
      ? isFloor
        ? "border-red-400 focus:border-red-400 focus:ring-red-400/30"
        : "border-error focus:border-error focus:ring-error/20"
      : "";

    return (
      <div className="w-full">
        {label && (
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor={textareaId}
              className={`block font-label text-xs font-bold uppercase tracking-wider ${
                isFloor ? "text-white/80" : "text-slate-700"
              }`}
            >
              {label}
            </label>
            {showCount && maxLength && (
              <span
                className={`text-[11px] font-mono ${
                  isFloor ? "text-white/50" : "text-slate-400"
                }`}
              >
                {currentLength}/{maxLength}
              </span>
            )}
          </div>
        )}

        <textarea
          id={textareaId}
          ref={ref}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={`w-full min-h-[96px] p-3 rounded-xl border font-body text-sm transition-all duration-150 outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs ${baseStyles} ${errorStyles} ${className}`}
          {...props}
        />

        {error ? (
          <p
            id={errorId}
            role="alert"
            className={`mt-1 font-body text-xs font-semibold flex items-center gap-1 ${
              isFloor ? "text-red-300" : "text-error"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </p>
        ) : helperText ? (
          <p
            id={helperId}
            className={`mt-1 font-body text-xs ${
              isFloor ? "text-white/60" : "text-text-secondary"
            }`}
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
