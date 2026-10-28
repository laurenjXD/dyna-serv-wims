"use client";

import { useEffect, useMemo, useState } from "react";

type CountLocation = {
  id: string;
  label: string | null;
  zone: string;
  stockLineCount: number;
  systemQty: number;
  activeSessionCount: number;
};

type FormAction = (formData: FormData) => void | Promise<void>;

export function LocationCountSelector({
  locations,
  createAction,
}: {
  locations: CountLocation[];
  createAction: FormAction;
}) {
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("all");
  const [countState, setCountState] = useState<"ready" | "active" | "all">("ready");
  const [selectedId, setSelectedId] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const zones = useMemo(
    () => [...new Set(locations.map((location) => location.zone).filter(Boolean))].sort(),
    [locations],
  );
  const filteredLocations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return locations.filter((location) => {
      const matchesQuery = !normalized || `${location.label ?? ""} ${location.zone}`.toLowerCase().includes(normalized);
      const matchesZone = zone === "all" || location.zone === zone;
      const matchesCountState = countState === "all"
        || (countState === "ready" && location.activeSessionCount === 0)
        || (countState === "active" && location.activeSessionCount > 0);
      return matchesQuery && matchesZone && location.stockLineCount > 0 && matchesCountState;
    });
  }, [countState, locations, query, zone]);
  const selected = locations.find((location) => location.id === selectedId) ?? null;
  const suggestions = filteredLocations.slice(0, 8);

  useEffect(() => {
    if (selectedId && !filteredLocations.some((location) => location.id === selectedId)) {
      setSelectedId("");
    }
  }, [filteredLocations, selectedId]);

  return (
    <form action={createAction} className="mt-6 space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_210px_180px] lg:items-end">
        <div className="relative">
          <label htmlFor="cycle-count-location-search" className="font-label text-label font-semibold text-text-grey">
            Find a location
          </label>
          <div className="relative">
            <input
              id="cycle-count-location-search"
              type="search"
              role="combobox"
              aria-expanded={searchFocused && suggestions.length > 0}
              aria-controls="cycle-count-location-suggestions"
              aria-autocomplete="list"
              value={query}
              onFocus={() => setSearchFocused(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchFocused(true);
              }}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Search location code or zone"
              className="mt-2 h-12 w-full rounded-xl border border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20"
            />
            {searchFocused && suggestions.length > 0 && (
              <div
                id="cycle-count-location-suggestions"
                role="listbox"
                className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-outline-variant bg-surface-white p-1 shadow-elevation-2"
              >
                {suggestions.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    role="option"
                    aria-selected={selectedId === location.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedId(location.id);
                      setQuery(location.label ?? location.id);
                      setSearchFocused(false);
                    }}
                    className="flex w-full items-start justify-between gap-4 rounded-lg px-3 py-3 text-left hover:bg-surface-low focus:bg-surface-low focus:outline-none"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-body-sm font-bold text-on-surface">
                        {location.label ?? location.id}
                      </span>
                      <span className="mt-1 block font-body text-body-xs text-text-grey">
                        Zone {location.zone} · {location.stockLineCount} item/lot lines · {location.systemQty.toLocaleString()} units
                      </span>
                    </span>
                    <span className="shrink-0 font-label text-body-xs font-semibold text-brand-navy">
                      {location.activeSessionCount > 0 ? "In progress" : "Ready"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="cycle-count-zone" className="font-label text-label font-semibold text-text-grey">Zone</label>
          <select
            id="cycle-count-zone"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface"
          >
            <option value="all">All zones</option>
            {zones.map((value) => <option key={value} value={value}>Zone {value}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cycle-count-state" className="font-label text-label font-semibold text-text-grey">Count state</label>
          <select
            id="cycle-count-state"
            value={countState}
            onChange={(event) => setCountState(event.target.value as typeof countState)}
            className="mt-2 h-12 w-full rounded-xl border border-outline-variant bg-surface-white px-3 font-body text-body-sm text-on-surface"
          >
            <option value="ready">Ready to count</option>
            <option value="active">Count in progress</option>
            <option value="all">All locations</option>
          </select>
        </div>
        <div className="flex items-end">
          <p className="w-full rounded-xl bg-surface-low px-3 py-3 font-body text-body-sm text-text-grey">Only locations with stock are shown.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-low/50 px-3 py-2">
        <p className="font-body text-body-sm text-text-grey">
          Showing <span className="font-semibold text-on-surface">{filteredLocations.length}</span> of {locations.length} locations
        </p>
        <p className="font-body text-body-xs text-text-grey">Ready to count = stock present and no active session</p>
      </div>

      <div className="space-y-5">
        {[...new Set(filteredLocations.map((location) => location.zone))].map((zoneName) => (
          <section key={zoneName} aria-labelledby={`count-zone-${zoneName}`}>
            <h3 id={`count-zone-${zoneName}`} className="mb-2 font-heading text-title-sm font-bold text-brand-navy">Zone {zoneName}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredLocations.filter((location) => location.zone === zoneName).map((location) => {
          const isSelected = selectedId === location.id;
          return (
            <button
              key={location.id}
              type="button"
              onClick={() => setSelectedId(location.id)}
              className={`rounded-xl border p-4 text-left transition ${isSelected ? "border-brand-navy bg-brand-navy/5 ring-2 ring-brand-navy/20" : "border-outline-variant/50 bg-surface-white hover:border-brand-navy/50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-body-md font-bold text-on-surface">{location.label ?? location.id}</p>
                  <p className="mt-1 font-body text-body-sm text-text-grey">Zone {location.zone} · Active location</p>
                </div>
                <span className="rounded-full bg-surface-low px-2 py-1 font-mono text-mono-xs font-semibold text-text-grey">
                  {location.activeSessionCount > 0 ? "Count active" : `${location.stockLineCount} lines`}
                </span>
              </div>
              <p className="mt-3 font-mono text-body-sm font-semibold text-brand-navy">
                {location.systemQty.toLocaleString()} system units
              </p>
            </button>
          );
              })}
            </div>
          </section>
        ))}
      </div>

      {filteredLocations.length === 0 && (
        <p className="rounded-xl border border-dashed border-outline-variant p-5 text-center font-body text-body-sm text-text-grey">
          No stocked locations match these filters. Try another location code, zone, or count state.
        </p>
      )}

      {selected && (
        <div className="flex flex-col gap-4 rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-label text-label font-bold uppercase text-brand-navy">Selected location</p>
            <p className="mt-1 font-mono text-body-md font-bold text-on-surface">{selected.label ?? selected.id} · Zone {selected.zone}</p>
            <p className="mt-1 font-body text-body-sm text-text-grey">{selected.stockLineCount} item/lot lines · {selected.systemQty.toLocaleString()} system units</p>
          </div>
          <input type="hidden" name="locationId" value={selected.id} />
          <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-navy px-5 font-label text-label font-semibold text-surface-white">
            Start Count for {selected.label ?? selected.id}
          </button>
        </div>
      )}
    </form>
  );
}
