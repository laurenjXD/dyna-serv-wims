"use client";

// Bulk location generator form — naming-convention config (Zone + comma
// -separated Rack list + numeric Level/Position ranges), reusing the same
// server-computed label format as the single-location form
// (generateLocationLabel: rack + level + "-" + position).
//
// Traceability:
//   specs/00-steering/per page specs.md §8 — "bulk location generator...
//     naming-convention config, capacity limits, and duplicate/error
//     reporting"
//   specs/00-steering/revision-log.md (2026-08-17) — Track B Milestone 2
//     scope calls entry
//   lib/enrollment/location-schema.ts — parseBulkLocationGeneratorInput,
//     expandBulkLocationCandidates, BULK_LOCATION_MAX_CANDIDATES

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import type { BulkGenerateFormState } from "../_actions";

const LOCATION_TYPES = [
  { value: "receiving_bay", label: "Receiving Bay" },
  { value: "inspection", label: "Inspection" },
  { value: "storage", label: "Storage" },
  { value: "picking", label: "Picking" },
  { value: "dispatch", label: "Dispatch" },
] as const;

type BulkGenerateAction = (
  prevState: BulkGenerateFormState,
  formData: FormData,
) => Promise<BulkGenerateFormState>;

interface BulkLocationGeneratorFormProps {
  action: BulkGenerateAction;
  cancelHref: string;
}

function previewCount(
  racks: string,
  levelStart: string,
  levelEnd: string,
  positionStart: string,
  positionEnd: string,
): number | null {
  const rackCount = new Set(
    racks.split(",").map((r) => r.trim()).filter(Boolean),
  ).size;
  const ls = parseInt(levelStart, 10);
  const le = parseInt(levelEnd, 10);
  const ps = parseInt(positionStart, 10);
  const pe = parseInt(positionEnd, 10);
  if (
    rackCount === 0 ||
    isNaN(ls) || isNaN(le) || isNaN(ps) || isNaN(pe) ||
    le < ls || pe < ps
  ) {
    return null;
  }
  return rackCount * (le - ls + 1) * (pe - ps + 1);
}

export function BulkLocationGeneratorForm({
  action,
  cancelHref,
}: BulkLocationGeneratorFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  const [racks, setRacks] = useState("");
  const [levelStart, setLevelStart] = useState("1");
  const [levelEnd, setLevelEnd] = useState("1");
  const [positionStart, setPositionStart] = useState("1");
  const [positionEnd, setPositionEnd] = useState("1");

  const count = useMemo(
    () => previewCount(racks, levelStart, levelEnd, positionStart, positionEnd),
    [racks, levelStart, levelEnd, positionStart, positionEnd],
  );

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

  if (state.result) {
    const { created, skippedDuplicates } = state.result;
    return (
      <div>
        <div className="rounded border border-status-available/30 bg-status-available/5 px-4 py-3">
          <p className="font-body text-body-md text-on-surface">
            <strong>{created.length}</strong> location
            {created.length === 1 ? "" : "s"} created.
            {skippedDuplicates.length > 0 && (
              <>
                {" "}
                <strong>{skippedDuplicates.length}</strong> skipped — label
                already existed.
              </>
            )}
          </p>
        </div>

        {created.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-md border border-outline-variant/30 bg-surface-white shadow-elevation-1">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                    <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                      Label
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {created.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {row.label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {skippedDuplicates.length > 0 && (
          <div className="mt-4 rounded border border-status-pending/30 bg-status-pending/5 px-4 py-3">
            <p className="font-label text-label text-text-grey">
              Skipped (label already existed):
            </p>
            <p className="mt-1 font-mono text-mono-md text-on-surface">
              {skippedDuplicates.join(", ")}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href={cancelHref}
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            Back to Locations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate>
      {state.error && (
        <div
          role="alert"
          className="mb-6 rounded border border-brand-red/30 bg-brand-red/5 px-4 py-3 font-body text-body-md text-brand-red"
        >
          {state.error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="zone" className="block font-label text-label text-on-surface">
            Zone{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="zone"
            name="zone"
            type="text"
            required
            maxLength={50}
            placeholder="e.g. A"
            className={inputClass("zone")}
          />
          {fieldError("zone")}
        </div>

        <div>
          <label htmlFor="locationType" className="block font-label text-label text-on-surface">
            Location Type{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <select
            id="locationType"
            name="locationType"
            defaultValue="storage"
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

        <div className="md:col-span-2">
          <label htmlFor="racks" className="block font-label text-label text-on-surface">
            Racks (comma-separated){" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="racks"
            name="racks"
            type="text"
            required
            value={racks}
            onChange={(e) => setRacks(e.target.value)}
            placeholder="e.g. A,B,C"
            className={inputClass("racks")}
          />
          {fieldError("racks")}
        </div>

        <div>
          <label htmlFor="levelStart" className="block font-label text-label text-on-surface">
            Level Start{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="levelStart"
            name="levelStart"
            type="number"
            min="1"
            step="1"
            required
            value={levelStart}
            onChange={(e) => setLevelStart(e.target.value)}
            className={inputClass("levelStart")}
          />
          {fieldError("levelStart")}
        </div>

        <div>
          <label htmlFor="levelEnd" className="block font-label text-label text-on-surface">
            Level End{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="levelEnd"
            name="levelEnd"
            type="number"
            min="1"
            step="1"
            required
            value={levelEnd}
            onChange={(e) => setLevelEnd(e.target.value)}
            className={inputClass("levelEnd")}
          />
          {fieldError("levelEnd")}
        </div>

        <div>
          <label htmlFor="positionStart" className="block font-label text-label text-on-surface">
            Position Start{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="positionStart"
            name="positionStart"
            type="number"
            min="1"
            step="1"
            required
            value={positionStart}
            onChange={(e) => setPositionStart(e.target.value)}
            className={inputClass("positionStart")}
          />
          {fieldError("positionStart")}
        </div>

        <div>
          <label htmlFor="positionEnd" className="block font-label text-label text-on-surface">
            Position End{" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="positionEnd"
            name="positionEnd"
            type="number"
            min="1"
            step="1"
            required
            value={positionEnd}
            onChange={(e) => setPositionEnd(e.target.value)}
            className={inputClass("positionEnd")}
          />
          {fieldError("positionEnd")}
        </div>

        <div>
          <label htmlFor="positionPadding" className="block font-label text-label text-on-surface">
            Position Zero-Padding
          </label>
          <input
            id="positionPadding"
            name="positionPadding"
            type="number"
            min="1"
            step="1"
            placeholder="auto"
            className={inputClass("positionPadding")}
          />
          {fieldError("positionPadding")}
          <p className="mt-1 font-body text-body-sm text-text-grey">
            e.g. 2 → position 1 becomes &quot;01&quot;. Defaults from Position
            End&apos;s digit count if left blank.
          </p>
        </div>

        <div>
          <label htmlFor="maxCbmCapacity" className="block font-label text-label text-on-surface">
            Max CBM Capacity (applied to all){" "}
            <span aria-hidden="true" className="text-brand-red">*</span>
          </label>
          <input
            id="maxCbmCapacity"
            name="maxCbmCapacity"
            type="number"
            min="0.0001"
            step="0.0001"
            required
            placeholder="e.g. 10.0000"
            className={inputClass("maxCbmCapacity")}
          />
          {fieldError("maxCbmCapacity")}
        </div>
      </div>

      {/* Batch size preview */}
      <div className="mt-6 rounded border border-outline-variant/30 bg-surface-light-grey px-4 py-3">
        <p className="font-label text-label text-text-grey">This will generate</p>
        {count !== null ? (
          <p className="mt-1 font-mono text-mono-md font-bold text-brand-navy">
            {count} location{count === 1 ? "" : "s"}
          </p>
        ) : (
          <p className="mt-1 font-body text-body-md text-status-neutral">
            Enter racks and valid level/position ranges to see a count.
          </p>
        )}
        <p className="mt-2 font-body text-body-sm text-text-grey">
          Existing labels are skipped automatically and reported after
          generation — nothing is overwritten.
        </p>
      </div>

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
          className="flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
        >
          {isPending ? "Generating…" : "Generate Locations"}
        </button>
      </div>
    </form>
  );
}
