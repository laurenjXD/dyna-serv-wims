import React from "react";

export interface LoadingSpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "white" | "current" | "neutral";
  className?: string;
}

const sizeClasses = {
  xs: "w-3.5 h-3.5",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

const variantClasses = {
  primary: "text-primary",
  white: "text-white",
  current: "text-current",
  neutral: "text-text-secondary",
};

export function LoadingSpinner({
  size = "md",
  variant = "current",
  className = "",
  ...props
}: LoadingSpinnerProps) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      className={`animate-spin ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      {...props}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
