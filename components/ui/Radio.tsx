import React, { forwardRef } from "react";

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  description?: string;
  surface?: "office" | "floor";
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      label,
      description,
      surface = "office",
      className = "",
      id,
      checked,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const radioId = id || generatedId;
    const isFloor = surface === "floor";

    return (
      <label
        htmlFor={radioId}
        className={`inline-flex items-start gap-3 cursor-pointer select-none ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${className}`}
      >
        <div className="relative flex items-center justify-center mt-0.5 shrink-0">
          <input
            type="radio"
            id={radioId}
            ref={ref}
            checked={checked}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <div
            className={`w-5 h-5 rounded-full border transition-all duration-150 flex items-center justify-center ${
              isFloor
                ? "border-white/40 bg-white/10 peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-white"
                : "border-slate-300 bg-white peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/20"
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity" />
          </div>
        </div>

        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span
                className={`font-body text-sm font-semibold leading-tight ${
                  isFloor ? "text-white" : "text-text-primary"
                }`}
              >
                {label}
              </span>
            )}
            {description && (
              <span
                className={`font-body text-xs mt-0.5 ${
                  isFloor ? "text-white/60" : "text-text-secondary"
                }`}
              >
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Radio.displayName = "Radio";
