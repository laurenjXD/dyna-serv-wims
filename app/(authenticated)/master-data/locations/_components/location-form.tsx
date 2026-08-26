"use client";

// Location create/edit form with client-side label preview.
// The label is always server-computed (never trusted from the client),
// but we show a preview to confirm before submit.
//
// Format: Rack + Level + "-" + Position (e.g. "A1-01")
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §6a
//   lib/enrollment/location-schema.ts — generateLocationLabel, parseLocationInput

import { useActionState, useState } from "react";
import Link from "next/link";
import type { LocationFormState } from "../_actions";
import type { LocationDetail } from "@/lib/db/queries/locations";

const LOCATION_TYPES = [
  { value: "receiving_bay", label: "Receiving Bay" },
  { value: "inspection", label: "Inspection" },
  { value: "storage", label: "Storage" },
  { value: "picking", label: "Picking" },
  { value: "dispatch", label: "Dispatch" },
] as const;

type LocationFormAction = (
  prevState: LocationFormState,
  formData: FormData,
) => Promise<LocationFormState>;

interface LocationFormProps {
  action: LocationFormAction;
  location?: LocationDetail;
  cancelHref: string;
  suggestions?: {
    zones: string[];
    racks: string[];
    levels: string[];
    positions: string[];
  };
}

function previewLabel(rack: string, level: string, position: string): string {
  if (!rack || !level || !position) return "";
  return `${rack.trim()}${level.trim()}-${position.trim()}`;
}

export function LocationForm({
  action,
  location,
  cancelHref,
  suggestions,
}: LocationFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const isEdit = !!location;

  const [rack, setRack] = useState(location?.rack ?? "");
  const [level, setLevel] = useState(location?.level ?? "");
  const [position, setPosition] = useState(location?.position ?? "");

  const labelPreview = previewLabel(rack, level, position);

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? (
      <p
        id={`${name}-error`}
        role="alert"
        className="mt-1 font-body text-body-sm text-brand-red"
      >
        {state.fieldErrors[name]}
      </p>
    ) : null;

  const inputClass = (name: string) =>
    `mt-1 block w-full rounded border ${
      state.fieldErrors?.[name]
        ? "border-brand-red"
        : "border-outline-variant/30"
    } bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy`;

  const ariaProps = (name: string) =>
    state.fieldErrors?.[name]
      ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` }
      : {};

  return (
    <form action={formAction} noValidate>
      {isEdit && (
        <>
          <input type="hidden" name="id" value={location.id} />
          {/* locations has no updated_at; createdAt is used as the stale-edit token */}
          <input
            type="hidden"
            name="updatedAt"
            value={location.createdAt.toISOString()}
          />
        </>
      )}

      {state.error && (
        <div
          role="alert"
          className="mb-6 rounded border border-brand-red/30 bg-brand-red/5 px-4 py-3 font-body text-body-md text-brand-red"
        >
          {state.error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Zone */}
        <div>
          <label
            htmlFor="zone"
            className="block font-label text-label text-on-surface"
          >
            Zone{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="zone"
            name="zone"
            type="text"
            required
            maxLength={50}
            defaultValue={location?.zone ?? ""}
            placeholder="e.g. A"
            list="location-zone-suggestions"
            className={inputClass("zone")}
            {...ariaProps("zone")}
          />
          <datalist id="location-zone-suggestions">{suggestions?.zones.map((value) => <option key={value} value={value} />)}</datalist>
          {fieldError("zone")}
        </div>

        {/* Location Type */}
        <div>
          <label
            htmlFor="locationType"
            className="block font-label text-label text-on-surface"
          >
            Location Type{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <select
            id="locationType"
            name="locationType"
            defaultValue={location?.locationType ?? "storage"}
            className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            {LOCATION_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {fieldError("locationType")}
        </div>

        {/* Rack */}
        <div>
          <label
            htmlFor="rack"
            className="block font-label text-label text-on-surface"
          >
            Rack{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="rack"
            name="rack"
            type="text"
            required
            maxLength={50}
            value={rack}
            onChange={(e) => setRack(e.target.value)}
            placeholder="e.g. A"
            list="location-rack-suggestions"
            className={inputClass("rack")}
            {...ariaProps("rack")}
          />
          {fieldError("rack")}
          <datalist id="location-rack-suggestions">{suggestions?.racks.map((value) => <option key={value} value={value} />)}</datalist>
        </div>

        {/* Level */}
        <div>
          <label
            htmlFor="level"
            className="block font-label text-label text-on-surface"
          >
            Level{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="level"
            name="level"
            type="text"
            required
            maxLength={50}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="e.g. 1"
            list="location-level-suggestions"
            className={inputClass("level")}
            {...ariaProps("level")}
          />
          {fieldError("level")}
          <datalist id="location-level-suggestions">{suggestions?.levels.map((value) => <option key={value} value={value} />)}</datalist>
        </div>

        {/* Position */}
        <div>
          <label
            htmlFor="position"
            className="block font-label text-label text-on-surface"
          >
            Position{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="position"
            name="position"
            type="text"
            required
            maxLength={50}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. 01"
            list="location-position-suggestions"
            className={inputClass("position")}
            {...ariaProps("position")}
          />
          {fieldError("position")}
          <datalist id="location-position-suggestions">{suggestions?.positions.map((value) => <option key={value} value={value} />)}</datalist>
        </div>

        {/* Max CBM Capacity */}
        <div>
          <label
            htmlFor="maxCbmCapacity"
            className="block font-label text-label text-on-surface"
          >
            Max CBM Capacity{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="maxCbmCapacity"
            name="maxCbmCapacity"
            type="number"
            min="0.0001"
            step="0.0001"
            required
            defaultValue={location?.maxCbmCapacity ?? ""}
            placeholder="e.g. 10.0000"
            className={inputClass("maxCbmCapacity")}
            {...ariaProps("maxCbmCapacity")}
          />
          {fieldError("maxCbmCapacity")}
        </div>

        {/* Active */}
        <div className="flex items-center gap-3">
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            defaultChecked={location?.isActive ?? true}
            value="true"
            onChange={(e) => {
              const hiddenInput = e.currentTarget
                .closest("form")
                ?.querySelector<HTMLInputElement>(
                  'input[name="isActive"][type="hidden"]',
                );
              if (hiddenInput) {
                hiddenInput.value = e.currentTarget.checked ? "true" : "false";
              }
            }}
            className="h-5 w-5 rounded border-outline-variant/30 text-brand-navy focus:ring-2 focus:ring-brand-navy"
          />
          <label
            htmlFor="isActive"
            className="font-label text-label text-on-surface"
          >
            Active
          </label>
          <input
            type="hidden"
            name="isActive"
            value={location?.isActive ?? true ? "true" : "false"}
          />
        </div>
      </div>

      {/* Label preview */}
      <div className="mt-6 rounded border border-outline-variant/30 bg-surface-light-grey px-4 py-3">
        <p className="font-label text-label text-text-grey">
          Generated Location Label{" "}
          <span className="font-body text-body-sm text-text-grey">
            (server-computed, shown for confirmation)
          </span>
        </p>
        {labelPreview ? (
          <p className="mt-1 font-mono text-mono-md font-bold text-brand-navy">
            {labelPreview}
          </p>
        ) : (
          <p className="mt-1 font-body text-body-md text-status-neutral">
            Enter rack, level, and position above to see the label preview.
          </p>
        )}
        {state.fieldErrors?.label && (
          <p role="alert" className="mt-1 font-body text-body-sm text-brand-red">
            {state.fieldErrors.label}
          </p>
        )}
        <p className="mt-2 font-body text-body-sm text-text-grey">
          Format: Rack + Level + &quot;-&quot; + Position (e.g. rack A, level 1,
          position 01 → <span className="font-mono">A1-01</span>). The server
          always re-computes and re-validates this value at write time.
        </p>
      </div>

      {/* Form actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Link
          href={cancelHref}
          className="flex h-11 items-center justify-center rounded bg-brand-navy px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center justify-center rounded bg-primary px-6 font-label text-label text-surface-white hover:bg-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
        >
          {isPending
            ? "Saving…"
            : isEdit
              ? "Save Changes"
              : "Create Location"}
        </button>
      </div>
    </form>
  );
}
