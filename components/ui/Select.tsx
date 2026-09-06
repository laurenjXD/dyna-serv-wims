import React, { forwardRef } from "react";
import { ChevronDown, AlertCircle } from "lucide-react";

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  helperText?: string;
  error?: string;
  options?: SelectOption[];
  sizeVariant?: "sm" | "md" | "lg";
  surface?: "office" | "floor";
}

const sizeStyles = {
  sm: "h-8 pl-2.5 pr-8 text-xs",
  md: "h-10 pl-3.5 pr-10 text-sm",
  lg: "h-12 pl-4 pr-12 text-base",
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error,
      options,
      sizeVariant = "md",
      surface = "office",
      className = "",
      id,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    const isFloor = surface === "floor";

    const baseSelectStyles = isFloor
      ? "bg-white/15 border-white/20 text-white focus:border-white focus:ring-white/30"
      : "bg-surface border-border text-text-primary focus:border-primary focus:ring-primary/20";

    const errorSelectStyles = error
      ? isFloor
        ? "border-red-400 focus:border-red-400 focus:ring-red-400/30"
        : "border-error focus:border-error focus:ring-error/20"
      : "";

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className={`block font-label text-xs font-bold uppercase tracking-wider mb-1.5 ${
              isFloor ? "text-white/80" : "text-slate-700"
            }`}
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          <select
            id={selectId}
            ref={ref}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full appearance-none rounded-xl border font-body transition-all duration-150 outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer ${
              sizeStyles[sizeVariant]
            } ${baseSelectStyles} ${errorSelectStyles} ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={String(opt.value)}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="text-slate-900 bg-white"
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <div
            className={`absolute right-3 flex items-center pointer-events-none ${
              isFloor ? "text-white/60" : "text-text-secondary"
            }`}
          >
            {error ? (
              <AlertCircle className="w-4 h-4 text-error" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className={`mt-1 font-body text-xs font-semibold flex items-center gap-1 ${
              isFloor ? "text-red-300" : "text-error"
            }`}
          >
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

Select.displayName = "Select";
