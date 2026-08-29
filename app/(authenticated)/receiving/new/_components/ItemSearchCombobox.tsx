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
  selectedItemDescription,
  onSelectItem,
  disabled = false,
}: ItemSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Filter available items by search query across code, name, customerItemCode, supplierItemCode
  const filteredItems = availableItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const itemCode = codeFor(item).toLowerCase();
    const name = item.name.toLowerCase();
    const custCode = (item.customerItemCode ?? "").toLowerCase();
    const supCode = (item.supplierItemCode ?? "").toLowerCase();
    return itemCode.includes(q) || name.includes(q) || custCode.includes(q) || supCode.includes(q);
  });

  const selectedItem = availableItems.find((item) => item.id === selectedItemId);
  const displayLabel = selectedItem
    ? `${codeFor(selectedItem)} — ${selectedItem.name}`
    : selectedItemCode
    ? `${selectedItemCode} ${selectedItemDescription ? `— ${selectedItemDescription}` : ""}`
    : "";

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger / Search Input */}
      <div className="relative mt-1">
        <div
          onClick={() => {
            if (!disabled && vendorPartyId) {
              setIsOpen(true);
            }
          }}
          className={`flex h-11 w-full cursor-pointer items-center justify-between rounded border px-3 font-body text-body-md transition-colors ${
            disabled || !vendorPartyId
              ? "cursor-not-allowed border-outline-variant/30 bg-surface-light-grey text-text-grey"
              : isOpen
              ? "border-brand-navy ring-2 ring-brand-navy/20 bg-surface-white"
              : selectedItemId
              ? "border-brand-navy/40 bg-surface-white text-on-surface font-medium"
              : "border-outline-variant/30 bg-surface-white text-text-grey hover:border-outline-variant/60"
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="h-4 w-4 shrink-0 text-text-grey" />
            <span className="truncate">
              {!vendorPartyId
                ? "Select organization first"
                : displayLabel || "Search or select item code…"}
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-text-grey transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && vendorPartyId && (
        <div className="absolute z-50 mt-1 max-h-80 w-full min-w-[320px] sm:min-w-[420px] overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-white shadow-elevation-4">
          {/* Quick Search Input */}
          <div className="border-b border-outline-variant/20 bg-surface-light-grey/60 p-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-grey" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type item code, supplier part #, or name…"
                className="h-9 w-full rounded-lg border border-outline-variant/40 bg-surface-white pl-9 pr-3 font-body text-body-sm text-on-surface placeholder:text-status-neutral focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
              />
            </div>
          </div>

          {/* Recommendations List */}
          <div className="max-h-52 overflow-y-auto divide-y divide-outline-variant/20 p-1">
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
                      setIsOpen(false);
                      setSearchQuery("");
                    }}
                    className={`flex w-full items-start justify-between gap-3 rounded-lg p-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-brand-navy/10 text-brand-navy font-semibold"
                        : "hover:bg-surface-light-grey/80 text-on-surface"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-body-sm font-bold text-brand-navy">
                          {formattedCode}
                        </span>
                        {item.customerItemCode && (
                          <span className="font-mono text-mono-xs text-text-grey">
                            (Cust: {item.customerItemCode})
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-body text-body-sm text-on-surface">
                        {item.name}
                      </p>
                      <div className="mt-1 flex items-center gap-3 font-mono text-mono-xs text-text-grey">
                        <span>SPQ: {item.spq}</span>
                        <span>&bull;</span>
                        <span>UOM: {item.uom}</span>
                        <span>&bull;</span>
                        <span>CBM: {item.volumeCbm}</span>
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
                  No enrolled item found
                </p>
                <p className="mt-0.5 font-body text-body-xs text-text-grey">
                  {searchQuery.trim()
                    ? `No item matched "${searchQuery}" for this organization.`
                    : "No items enrolled for this vendor organization."}
                </p>
              </div>
            )}
          </div>

          {/* Enroll New Item Redirect Bar */}
          <div className="border-t border-outline-variant/30 bg-[#F0F4FF] p-2.5">
            <Link
              href={`/master-data/items/new${searchQuery.trim() ? `?code=${encodeURIComponent(searchQuery.trim())}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-2 rounded-lg bg-surface-white border border-brand-navy/30 px-3 py-2 font-label text-label-xs font-bold text-brand-navy shadow-sm hover:bg-brand-navy hover:text-surface-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <PlusCircle className="h-4 w-4 text-brand-royal-blue group-hover:text-surface-white" />
                <span>
                  {searchQuery.trim() ? `Enroll "${searchQuery.trim()}" in Master Data` : "Enroll New Item in Master Data"}
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
