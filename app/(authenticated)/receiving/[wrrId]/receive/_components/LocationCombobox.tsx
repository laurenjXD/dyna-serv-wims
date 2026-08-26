"use client";

import { useMemo, useState } from "react";

export type LocationOption = {
  id: string;
  label: string;
  detail?: string;
  capacity?: { occupied: number; maximum: number };
  disabled?: boolean;
};

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
              <button type="button" disabled={option.disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className={`w-full px-3 py-3 text-left focus:outline-none ${option.disabled ? "cursor-not-allowed bg-surface-light-grey text-text-grey opacity-60" : "hover:bg-surface-light-grey focus:bg-surface-light-grey"}`}>
                <span className="block font-mono text-body-md font-bold text-on-surface">{option.label}</span>
                {option.detail && <span className="block font-body text-body-sm text-text-grey">{option.detail}</span>}
                {option.capacity && (
                  <span className="mt-2 block" aria-label={`${option.capacity.occupied.toFixed(2)} of ${option.capacity.maximum.toFixed(2)} CBM occupied`}>
                    <span className="mb-1 flex justify-between font-label text-mono-sm text-text-grey"><span>Capacity</span><span>{option.capacity.occupied.toFixed(2)} / {option.capacity.maximum.toFixed(2)} CBM</span></span>
                    <span className="block h-2 overflow-hidden rounded-full bg-outline-variant/30"><span className={`block h-full rounded-full ${option.capacity.occupied / option.capacity.maximum >= 0.9 ? "bg-status-held" : option.capacity.occupied / option.capacity.maximum >= 0.75 ? "bg-status-pending" : "bg-status-available"}`} style={{ width: `${Math.min(100, Math.max(0, (option.capacity.occupied / option.capacity.maximum) * 100))}%` }} /></span>
                  </span>
                )}
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
