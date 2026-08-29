"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlusCircle, Search } from "lucide-react";

export type SearchableItemOption = {
  id: string;
  code: string;
  name: string;
  supplierItemCode?: string | null;
  customerItemCode?: string | null;
  dsgcItemNumber?: string | null;
  uom?: string;
  spq?: number;
};

interface ItemSearchComboboxProps {
  id: string;
  name?: string;
  options: SearchableItemOption[];
  value?: string;
  defaultValue?: string;
  onChange: (itemId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  enrollHref?: string;
}

export function ItemSearchCombobox({
  id,
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "Search item code, name, or part #...",
  disabled = false,
  required = false,
  enrollHref = "/master-data/items/new",
}: ItemSearchComboboxProps) {
  const [internalValue, setInternalValue] = useState(value ?? defaultValue);
  const selectedValue = value ?? internalValue;
  const selectedItem = options.find((opt) => opt.id === selectedValue);

  const [query, setQuery] = useState(selectedItem ? `${selectedItem.code} — ${selectedItem.name}` : "");
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options.slice(0, 10);
    return options
      .filter((opt) => {
        const fullText = `${opt.code} ${opt.name} ${opt.supplierItemCode ?? ""} ${opt.customerItemCode ?? ""} ${opt.dsgcItemNumber ?? ""}`.toLowerCase();
        return fullText.includes(normalized);
      })
      .slice(0, 10);
  }, [options, query]);

  function choose(item: SearchableItemOption) {
    if (value === undefined) setInternalValue(item.id);
    onChange(item.id);
    setQuery(`${item.code} — ${item.name}`);
    setIsOpen(false);
  }

  return (
    <div className="relative w-full">
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-text-grey" aria-hidden="true" />
        <input
          id={id}
          type="search"
          autoComplete="off"
          disabled={disabled}
          required={required}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedValue) {
              if (value === undefined) setInternalValue("");
              onChange("");
            }
            setIsOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 200)}
          placeholder={placeholder}
          className="h-11 w-full rounded border border-outline-variant/30 bg-surface-white pl-10 pr-3 font-body text-body-md text-on-surface placeholder:text-text-grey focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:bg-surface-light-grey"
          aria-controls={`${id}-suggestions`}
          aria-autocomplete="list"
        />
      </div>

      {isOpen && (
        <div
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-outline-variant bg-surface-white py-1 shadow-elevation-2"
        >
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === selectedValue}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
                className={`w-full px-4 py-2.5 text-left transition-colors focus:outline-none ${
                  item.id === selectedValue
                    ? "bg-accent-indigo-50/70 font-semibold"
                    : "hover:bg-surface-light-grey focus:bg-surface-light-grey"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-mono-md font-bold text-on-surface">{item.code}</span>
                  {item.uom && (
                    <span className="rounded bg-outline-variant/30 px-1.5 py-0.5 font-label text-label-xs uppercase text-text-grey">
                      {item.uom}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate font-body text-body-sm text-text-grey">{item.name}</p>
                {(item.supplierItemCode || item.customerItemCode || item.dsgcItemNumber) && (
                  <p className="mt-0.5 truncate font-mono text-body-xs text-text-grey/80">
                    {[
                      item.supplierItemCode && `Sup: ${item.supplierItemCode}`,
                      item.customerItemCode && `Cust: ${item.customerItemCode}`,
                      item.dsgcItemNumber && `DSGC: ${item.dsgcItemNumber}`,
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                  </p>
                )}
              </button>
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="font-body text-body-sm text-text-grey">No matching items found</p>
              <Link
                href={enrollHref}
                target="_blank"
                className="mt-2 inline-flex items-center gap-1.5 font-label text-label-xs font-bold text-brand-navy hover:underline"
              >
                <PlusCircle className="h-4 w-4" />
                Enroll new item in master data &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
