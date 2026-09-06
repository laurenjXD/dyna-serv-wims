import React, { forwardRef, useEffect, useRef } from "react";
import { X, AlertCircle } from "lucide-react";

export type InputSize = "sm" | "md" | "lg" | "floor";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  clearable?: boolean;
  onClear?: () => void;
  scannerAutofocus?: boolean;
  sizeVariant?: InputSize;
  surface?: "office" | "floor";
}

const sizeStyles: Record<InputSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-3.5 text-sm",
  lg: "h-12 px-4 text-base",
  floor: "h-14 px-4 text-base font-semibold",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      clearable = false,
      onClear,
      scannerAutofocus = false,
      sizeVariant = "md",
      surface = "office",
      className = "",
      id,
      disabled,
      value,
      onChange,
      ...props
    },
    forwardedRef
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    useEffect(() => {
      if (scannerAutofocus && inputRef.current) {
        inputRef.current.focus();
      }
    }, [scannerAutofocus]);

    const isFloor = surface === "floor";
    const hasValue = value !== undefined && value !== "" && value !== null;

    const baseInputStyles = isFloor
      ? "bg-white/15 border-white/20 text-white placeholder:text-white/40 focus:border-white focus:ring-white/30"
      : "bg-surface border-border text-text-primary placeholder:text-text-secondary/60 focus:border-primary focus:ring-primary/20";

    const errorInputStyles = error
      ? isFloor
        ? "border-red-400 focus:border-red-400 focus:ring-red-400/30"
        : "border-error focus:border-error focus:ring-error/20"
      : "";

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className={`block font-label text-xs font-bold uppercase tracking-wider mb-1.5 ${
              isFloor ? "text-white/80" : "text-slate-700"
            }`}
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div
              className={`absolute left-3 flex items-center pointer-events-none ${
                isFloor ? "text-white/60" : "text-text-secondary"
              }`}
            >
              {leftIcon}
            </div>
          )}

          <input
            id={inputId}
            ref={(node) => {
              inputRef.current = node;
              if (typeof forwardedRef === "function") {
                forwardedRef(node);
              } else if (forwardedRef) {
                forwardedRef.current = node;
              }
            }}
            value={value}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full rounded-xl border font-body transition-all duration-150 outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs ${
              sizeStyles[sizeVariant]
            } ${baseInputStyles} ${errorInputStyles} ${leftIcon ? "pl-10" : ""} ${
              rightIcon || clearable || error ? "pr-10" : ""
            } ${className}`}
            {...props}
          />

          <div className="absolute right-3 flex items-center gap-1.5">
            {clearable && hasValue && !disabled && (
              <button
                type="button"
                onClick={() => {
                  if (onClear) onClear();
                }}
                className={`p-0.5 rounded-full transition-colors ${
                  isFloor
                    ? "text-white/60 hover:text-white hover:bg-white/10"
                    : "text-text-secondary hover:text-text-primary hover:bg-slate-100"
                }`}
                aria-label="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {error && !clearable && (
              <AlertCircle
                className={`w-4 h-4 shrink-0 ${isFloor ? "text-red-400" : "text-error"}`}
                aria-hidden="true"
              />
            )}

            {rightIcon && !error && (
              <div
                className={`flex items-center pointer-events-none ${
                  isFloor ? "text-white/60" : "text-text-secondary"
                }`}
              >
                {rightIcon}
              </div>
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

Input.displayName = "Input";
