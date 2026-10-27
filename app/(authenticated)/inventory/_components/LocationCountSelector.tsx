"use client";

import { useMemo, useState } from "react";

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
  const [stockOnly, setStockOnly] = useState(true);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [selectedId, setSelectedId] = useState("");

  const zones = useMemo(
    () => [...new Set(locations.map((location) => location.zone).filter(Boolean))].sort(),
    [locations],
  );
  const filteredLocations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return locations.filter((location) => {
      const matchesQuery = !normalized || `${location.label ?? ""} ${location.zone}`.toLowerCase().includes(normalized);
      const matchesZone = zone === "all" || location.zone === zone;
      const matchesStock = !stockOnly || location.stockLineCount > 0;
      const matchesAvailability = !availableOnly || location.activeSessionCount === 0;
      return matchesQuery && matchesZone && matchesStock && matchesAvailability;
    });
  }, [availableOnly, locations, query, stockOnly, zone]);
  const selected = locations.find((location) => location.id === selectedId) ?? null;
  const hasLocationFilter = query.trim().length > 0 || zone !== "all" || !stockOnly || !availableOnly;

  return (
    <form action={createAction} className="mt-6 space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-end">
        <div>
          <label htmlFor="cycle-count-location-search" className="font-label text-label font-semibold text-text-grey">
            Find a location
          </label>
          <input
            id="cycle-count-location-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search code, label, or zone"
            className="mt-2 h-12 w-full rounded-xl border border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20"
          />
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
        <label className="flex h-12 items-center gap-2 rounded-xl border border-outline-variant px-3 font-body text-body-sm text-on-surface">
          <input type="checkbox" checked={stockOnly} onChange={(event) => setStockOnly(event.target.checked)} />
          Has system stock
        </label>
        <label className="flex h-12 items-center gap-2 rounded-xl border border-outline-variant px-3 font-body text-body-sm text-on-surface">
          <input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />
          No active count
        </label>
      </div>

      {!hasLocationFilter ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-low/40 p-5 text-center">
          <p className="font-body text-body-sm font-semibold text-on-surface">Search or filter to choose a location</p>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Enter a location code, label, or zone, or choose a zone below. Only locations with recorded system stock are shown by default.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredLocations.map((location) => {
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
      )}

      {hasLocationFilter && filteredLocations.length === 0 && (
        <p className="rounded-xl border border-dashed border-outline-variant p-5 text-center font-body text-body-sm text-text-grey">
          No active locations match these filters. Try another search or include empty locations.
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
