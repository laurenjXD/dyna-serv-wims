import React, { forwardRef, useState } from "react";
import { Search, X } from "lucide-react";

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  onSearch?: (value: string) => void;
  onClear?: () => void;
  shortcutHint?: string;
  sizeVariant?: "sm" | "md" | "lg";
  surface?: "office" | "floor";
}

const sizeStyles = {
  sm: "h-8 pl-8 pr-8 text-xs",
  md: "h-10 pl-9 pr-9 text-sm",
  lg: "h-12 pl-11 pr-11 text-base",
};

const iconSizes = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      onSearch,
      onClear,
      shortcutHint,
      sizeVariant = "md",
      surface = "office",
      className = "",
      value,
      onChange,
      placeholder = "Search...",
      ...props
    },
    ref
  ) => {
    const [internalVal, setInternalVal] = useState("");
    const isControlled = value !== undefined;
    const currentVal = isControlled ? String(value) : internalVal;
    const isFloor = surface === "floor";

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalVal(e.target.value);
      }
      if (onChange) onChange(e);
      if (onSearch) onSearch(e.target.value);
    };

    const handleClear = () => {
      if (!isControlled) {
        setInternalVal("");
      }
      if (onClear) onClear();
      if (onSearch) onSearch("");
    };

    const baseInputStyles = isFloor
      ? "bg-white/15 border-white/20 text-white placeholder:text-white/40 focus:border-white focus:ring-white/30"
      : "bg-surface border-border text-text-primary placeholder:text-text-secondary/60 focus:border-primary focus:ring-primary/20";

    return (
      <div className="relative flex items-center w-full">
        <div
          className={`absolute left-3 flex items-center pointer-events-none ${
            isFloor ? "text-white/60" : "text-text-secondary"
          }`}
        >
          <Search className={iconSizes[sizeVariant]} />
        </div>

        <input
          ref={ref}
          type="text"
          value={currentVal}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full rounded-xl border font-body transition-all duration-150 outline-none focus:ring-2 disabled:opacity-50 shadow-2xs ${
            sizeStyles[sizeVariant]
          } ${baseInputStyles} ${className}`}
          {...props}
        />

        <div className="absolute right-2.5 flex items-center gap-1.5">
          {currentVal ? (
            <button
              type="button"
              onClick={handleClear}
              className={`p-1 rounded-full transition-colors ${
                isFloor
                  ? "text-white/60 hover:text-white hover:bg-white/10"
                  : "text-text-secondary hover:text-text-primary hover:bg-slate-100"
              }`}
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : shortcutHint ? (
            <kbd
              className={`hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border ${
                isFloor
                  ? "bg-white/10 border-white/20 text-white/70"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
            >
              {shortcutHint}
            </kbd>
          ) : null}
        </div>
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
