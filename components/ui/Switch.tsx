import React, { forwardRef } from "react";

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  description?: string;
  sizeVariant?: "sm" | "md";
}

const trackSizes = {
  sm: "w-8 h-4",
  md: "w-11 h-6",
};

const thumbSizes = {
  sm: "w-3 h-3 translate-x-0.5 peer-checked:translate-x-4",
  md: "w-5 h-5 translate-x-0.5 peer-checked:translate-x-5",
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      label,
      description,
      sizeVariant = "md",
      className = "",
      id,
      checked,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const switchId = id || generatedId;

    return (
      <label
        htmlFor={switchId}
        className={`inline-flex items-start gap-3 cursor-pointer select-none ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${className}`}
      >
        <div className="relative flex items-center shrink-0 mt-0.5">
          <input
            type="checkbox"
            role="switch"
            id={switchId}
            ref={ref}
            checked={checked}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <div
            className={`rounded-full bg-slate-200 transition-colors duration-200 peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/20 ${trackSizes[sizeVariant]}`}
          />
          <div
            className={`absolute top-0.5 left-0 rounded-full bg-white shadow-xs transition-transform duration-200 ${thumbSizes[sizeVariant]}`}
          />
        </div>

        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span className="font-body text-sm font-semibold text-text-primary leading-tight">
                {label}
              </span>
            )}
            {description && (
              <span className="font-body text-xs text-text-secondary mt-0.5">
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Switch.displayName = "Switch";
