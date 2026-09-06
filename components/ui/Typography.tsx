import React from "react";

export type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type HeadingSize = "xl" | "lg" | "md" | "sm" | "xs";

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: HeadingLevel;
  size?: HeadingSize;
  surface?: "office" | "floor";
  children: React.ReactNode;
}

const defaultSizeForTag: Record<HeadingLevel, HeadingSize> = {
  h1: "xl",
  h2: "lg",
  h3: "md",
  h4: "sm",
  h5: "xs",
  h6: "xs",
};

const headingSizeStyles: Record<HeadingSize, string> = {
  xl: "text-headline-xl font-bold tracking-tight", // 40px / 48px
  lg: "text-headline-lg font-bold tracking-tight", // 32px / 40px
  md: "text-headline-md font-semibold",           // 24px / 32px
  sm: "text-xl font-semibold leading-7",          // 20px / 28px
  xs: "text-lg font-semibold leading-6",          // 18px / 24px
};

export function Heading({
  as: Component = "h2",
  size,
  surface = "office",
  className = "",
  children,
  ...props
}: HeadingProps) {
  const effectiveSize = size || defaultSizeForTag[Component];
  const isFloor = surface === "floor";

  return (
    <Component
      className={`font-heading ${headingSizeStyles[effectiveSize]} ${
        isFloor ? "text-white" : "text-text-primary"
      } ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}

export type TextSize = "lg" | "md" | "sm" | "xs";
export type TextVariant =
  | "primary"
  | "secondary"
  | "muted"
  | "error"
  | "success"
  | "warning"
  | "mono";
export type TextWeight = "regular" | "medium" | "semibold" | "bold";

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "div" | "label";
  size?: TextSize;
  variant?: TextVariant;
  weight?: TextWeight;
  surface?: "office" | "floor";
  children: React.ReactNode;
}

const textSizeStyles: Record<TextSize, string> = {
  lg: "text-body-lg leading-7", // 18px / 28px
  md: "text-body-md leading-6", // 16px / 24px (Floor minimum)
  sm: "text-body-sm leading-5", // 14px / 20px (Office only)
  xs: "text-xs leading-4",      // 12px / 16px (Office only)
};

const textWeightStyles: Record<TextWeight, string> = {
  regular: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const textVariantStyles: Record<TextVariant, { office: string; floor: string }> = {
  primary: { office: "text-text-primary", floor: "text-white" },
  secondary: { office: "text-text-secondary", floor: "text-white/70" },
  muted: { office: "text-slate-400", floor: "text-white/50" },
  error: { office: "text-error", floor: "text-red-300" },
  success: { office: "text-success", floor: "text-emerald-300" },
  warning: { office: "text-warning", floor: "text-amber-300" },
  mono: { office: "font-mono font-bold text-slate-900 tracking-tight", floor: "font-mono font-bold text-white tracking-tight" },
};

export function Text({
  as: Component = "p",
  size = "md",
  variant = "primary",
  weight = "regular",
  surface = "office",
  className = "",
  children,
  ...props
}: TextProps) {
  const isFloor = surface === "floor";
  // On floor screens, enforce minimum 16px (body-md)
  const effectiveSize = isFloor && (size === "sm" || size === "xs") ? "md" : size;

  const colorStyle = textVariantStyles[variant][isFloor ? "floor" : "office"];

  return (
    <Component
      className={`font-body ${textSizeStyles[effectiveSize]} ${textWeightStyles[weight]} ${colorStyle} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  surface?: "office" | "floor";
  size?: "sm" | "md";
  children: React.ReactNode;
}

export function Label({
  required = false,
  surface = "office",
  size = "md",
  className = "",
  children,
  ...props
}: LabelProps) {
  const isFloor = surface === "floor";

  return (
    <label
      className={`block font-label uppercase tracking-wider font-bold select-none ${
        size === "sm" ? "text-[11px]" : "text-xs"
      } ${isFloor ? "text-white/80" : "text-slate-700"} ${className}`}
      {...props}
    >
      {children}
      {required && (
        <span
          className={`ml-1 ${isFloor ? "text-red-400" : "text-error"}`}
          aria-hidden="true"
        >
          *
        </span>
      )}
    </label>
  );
}

export interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  size?: "sm" | "md" | "lg";
  surface?: "office" | "floor";
  children: React.ReactNode;
}

const codeSizes = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-sm px-2 py-1",
  lg: "text-base px-2.5 py-1.5",
};

export function Code({
  size = "md",
  surface = "office",
  className = "",
  children,
  ...props
}: CodeProps) {
  const isFloor = surface === "floor";

  return (
    <code
      className={`font-mono font-bold tracking-tight rounded-md border ${codeSizes[size]} ${
        isFloor
          ? "bg-white/10 text-white border-white/20"
          : "bg-slate-100 text-slate-900 border-slate-200"
      } ${className}`}
      {...props}
    >
      {children}
    </code>
  );
}

export interface DataDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  value: React.ReactNode;
  unit?: string;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
  surface?: "office" | "floor";
}

const dataDisplaySizes = {
  sm: "text-xl leading-6",
  md: "text-2xl leading-7",
  lg: "text-3xl sm:text-4xl leading-9",
  xl: "text-4xl sm:text-5xl leading-10",
};

export function DataDisplay({
  value,
  unit,
  label,
  size = "md",
  surface = "office",
  className = "",
  ...props
}: DataDisplayProps) {
  const isFloor = surface === "floor";

  return (
    <div className={`flex flex-col ${className}`} {...props}>
      {label && (
        <span
          className={`font-label text-xs uppercase tracking-wider font-bold mb-1 ${
            isFloor ? "text-white/70" : "text-text-secondary"
          }`}
        >
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-heading font-bold tracking-tight ${dataDisplaySizes[size]} ${
            isFloor ? "text-white" : "text-text-primary"
          }`}
        >
          {value}
        </span>
        {unit && (
          <span
            className={`font-body text-sm font-semibold ${
              isFloor ? "text-white/60" : "text-text-secondary"
            }`}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
