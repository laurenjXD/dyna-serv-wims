import React, { forwardRef } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost"
  | "link"
  | "floor-primary"
  | "floor-success"
  | "floor-danger";

export type ButtonSize = "sm" | "md" | "lg" | "floor";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover shadow-sm active:scale-[0.98] focus-visible:ring-primary",
  secondary:
    "bg-surface text-text-primary border border-border hover:bg-slate-50 shadow-xs active:scale-[0.98] focus-visible:ring-primary",
  outline:
    "border border-border text-text-primary hover:bg-slate-100 active:scale-[0.98] focus-visible:ring-primary",
  destructive:
    "bg-error text-white hover:bg-red-600 shadow-sm active:scale-[0.98] focus-visible:ring-error",
  ghost:
    "text-text-primary hover:bg-slate-100 active:scale-[0.98] focus-visible:ring-primary",
  link:
    "text-primary underline-offset-4 hover:underline p-0 h-auto focus-visible:ring-primary",
  "floor-primary":
    "bg-primary text-white font-bold text-lg rounded-xl shadow-md min-h-[64px] active:scale-[0.97] focus-visible:ring-white tracking-wide uppercase",
  "floor-success":
    "bg-success text-white font-bold text-lg rounded-xl shadow-md min-h-[64px] active:scale-[0.97] focus-visible:ring-white tracking-wide uppercase",
  "floor-danger":
    "bg-error text-white font-bold text-lg rounded-xl shadow-md min-h-[64px] active:scale-[0.97] focus-visible:ring-white tracking-wide uppercase",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
  floor: "h-16 px-6 text-lg gap-3 rounded-xl min-h-[64px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = "",
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    // If a floor variant is selected, default to floor size unless overridden
    const effectiveSize = variant.startsWith("floor-") && size === "md" ? "floor" : size;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center font-heading font-semibold transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
          variantStyles[variant]
        } ${variant !== "link" ? sizeStyles[effectiveSize] : ""} ${
          fullWidth ? "w-full" : ""
        } ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <LoadingSpinner
              size={effectiveSize === "sm" ? "xs" : effectiveSize === "floor" ? "lg" : "sm"}
              variant="current"
            />
            {loadingText || children}
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0 items-center">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="inline-flex shrink-0 items-center">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
