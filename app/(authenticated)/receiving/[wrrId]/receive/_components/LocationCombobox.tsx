"use client";

import { useMemo, useState } from "react";

export type LocationOption = { id: string; label: string; detail?: string };

export function LocationCombobox({
  id,
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Search locations...",
  required = false,
}: {
  id: string;
  name?: string;
  options: LocationOption[];
  value?: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [internalValue, setInternalValue] = useState(value ?? defaultValue);
  const selectedValue = value ?? internalValue;
  const selected = options.find((option) => option.id === selectedValue);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options
      .filter((option) => !normalized || `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [options, query]);

  function choose(option: LocationOption) {
    if (value === undefined) setInternalValue(option.id);
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedValue} />
      <input
        id={id}
        type="search"
        value={query}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (selectedValue) {
            if (value === undefined) setInternalValue("");
            onChange("");
          }
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="h-14 w-full rounded-lg border-2 border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-text-grey focus:outline-none focus:ring-4 focus:ring-brand-navy"
        aria-controls={`${id}-suggestions`}
        aria-autocomplete="list"
      />
      {open && filtered.length > 0 && (
        <ul id={`${id}-suggestions`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-outline-variant bg-surface-white py-1 shadow-elevation-2">
          {filtered.map((option) => (
            <li key={option.id} role="option" aria-selected={option.id === selectedValue}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className="w-full px-3 py-3 text-left hover:bg-surface-light-grey focus:bg-surface-light-grey focus:outline-none">
                <span className="block font-mono text-body-md font-bold text-on-surface">{option.label}</span>
                {option.detail && <span className="block font-body text-body-sm text-text-grey">{option.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-outline-variant bg-surface-white px-3 py-3 font-body text-body-sm text-text-grey shadow-elevation-2">No matching locations</p>
      )}
    </div>
  );
}
