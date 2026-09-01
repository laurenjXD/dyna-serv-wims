"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, PlusCircle, Check, ChevronDown, ExternalLink, AlertCircle } from "lucide-react";
import type { WrrItemOption } from "@/lib/db/queries/items";

interface ItemSearchComboboxProps {
  index?: number;
  flowType: string;
  vendorPartyId: string;
  availableItems: WrrItemOption[];
  selectedItemId: string;
  selectedItemCode: string;
  selectedItemDescription: string;
  onSelectItem: (item: WrrItemOption) => void;
  disabled?: boolean;
}

export function ItemSearchCombobox({
  index: _index,
  flowType,
  vendorPartyId,
  availableItems,
  selectedItemId,
  selectedItemCode,
  selectedItemDescription: _selectedItemDescription,
  onSelectItem,
  disabled = false,
}: ItemSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(selectedItemCode || "");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync external selection to local input value
  useEffect(() => {
    setInputValue(selectedItemCode || "");
  }, [selectedItemCode]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function codeFor(item: WrrItemOption): string {
    return flowType === "trading"
      ? (item.dsgcItemNumber ?? item.code)
      : (item.supplierItemCode ?? item.code);
  }

  // Filter available items conditionally by organization, flowType, and input value
  const filteredItems = availableItems.filter((item) => {
    if (!inputValue.trim()) return true;
    const q = inputValue.toLowerCase().trim();
    const itemCode = codeFor(item).toLowerCase();
    const name = item.name.toLowerCase();
    const custCode = (item.customerItemCode ?? "").toLowerCase();
    const supCode = (item.supplierItemCode ?? "").toLowerCase();
    return itemCode.includes(q) || name.includes(q) || custCode.includes(q) || supCode.includes(q);
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Searchable Direct Input Field */}
      <div className="relative mt-1">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 shrink-0 text-text-grey" />
          <input
            type="text"
            disabled={disabled || !vendorPartyId}
            value={inputValue}
            onFocus={() => {
              if (!disabled && vendorPartyId) setIsOpen(true);
            }}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (!isOpen && vendorPartyId) setIsOpen(true);
            }}
            placeholder={
              !vendorPartyId
                ? "Select organization first"
                : "Type item code (e.g. DSGC, ITM, 000)..."
            }
            className={`h-11 w-full rounded border pl-9 pr-8 font-body text-body-md transition-colors ${
              disabled || !vendorPartyId
                ? "cursor-not-allowed border-outline-variant/30 bg-surface-light-grey text-text-grey"
                : isOpen
                ? "border-brand-navy ring-2 ring-brand-navy/20 bg-surface-white text-on-surface"
                : selectedItemId
                ? "border-brand-navy/40 bg-surface-white text-on-surface font-medium"
                : "border-outline-variant/30 bg-surface-white text-text-grey hover:border-outline-variant/60"
            }`}
          />
          <ChevronDown
            onClick={() => {
              if (!disabled && vendorPartyId) setIsOpen(!isOpen);
            }}
            className={`absolute right-3 h-4 w-4 cursor-pointer text-text-grey transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Real-time Recommendations Dropdown */}
      {isOpen && vendorPartyId && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-80 min-w-0 max-w-full overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-white shadow-elevation-4">
          <div className="border-b border-outline-variant/20 bg-surface-light-grey/60 px-3 py-2">
            <p className="truncate font-label text-label-xs uppercase tracking-wider text-text-grey">
              Enrolled Item Recommendations ({filteredItems.length})
            </p>
          </div>

          {/* Recommendations List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-outline-variant/20 p-1">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const isSelected = item.id === selectedItemId;
                const formattedCode = codeFor(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectItem(item);
                      setInputValue(formattedCode);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-start justify-between gap-3 rounded-lg p-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-brand-navy/10 text-brand-navy font-semibold"
                        : "hover:bg-surface-light-grey/80 text-on-surface"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-body-sm font-bold text-brand-navy">
                          {formattedCode}
                        </span>
                        {item.customerItemCode && (
                          <span className="truncate font-mono text-mono-xs text-text-grey">
                            (Cust: {item.customerItemCode})
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-body text-body-sm text-on-surface">
                        {item.name}
                      </p>
                      <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden font-mono text-mono-xs text-text-grey">
                        <span className="shrink-0">SPQ: {item.spq}</span>
                        <span className="shrink-0">&bull;</span>
                        <span className="shrink-0">UOM: {item.uom}</span>
                        <span className="shrink-0">&bull;</span>
                        <span className="truncate">CBM: {item.volumeCbm}</span>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-brand-navy mt-1" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-status-held/70" />
                <p className="mt-2 font-body text-body-sm font-semibold text-on-surface">
                  Item Not Found
                </p>
                <p className="mt-0.5 font-body text-body-xs text-text-grey">
                  No enrolled item matches &quot;{inputValue}&quot; for this organization.
                </p>
              </div>
            )}
          </div>

          {/* Enroll New Item Redirect Link */}
          <div className="border-t border-outline-variant/30 bg-[#F0F4FF] p-2.5">
            <Link
              href={`/master-data/items/new${inputValue.trim() ? `?code=${encodeURIComponent(inputValue.trim())}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-w-0 items-center justify-between gap-2 rounded-lg border border-brand-navy/30 bg-surface-white px-3 py-2 font-label text-label-xs font-bold text-brand-navy shadow-sm transition-colors hover:bg-brand-navy hover:text-surface-white"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <PlusCircle className="h-4 w-4 text-brand-royal-blue group-hover:text-surface-white" />
                <span className="truncate">
                  {inputValue.trim() ? `+ Enroll "${inputValue.trim()}" in Master Data` : "+ Enroll New Item in Master Data"}
                </span>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-text-grey group-hover:text-surface-white" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
