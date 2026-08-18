"use client";

// Party create and edit form.
// Accessible, touch-target–compliant (office minimum 44px), no glassmorphism
// on any input surface.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §5
//   specs/00-steering/brand-design-system.md §2, §3, §9, §11

import { useActionState } from "react";
import Link from "next/link";
import type { PartyFormState } from "../_actions";
import type { PartyDetail } from "@/lib/db/queries/parties";

const PARTY_ROLES = [
  { value: "vendor", label: "Vendor" },
  { value: "supplier", label: "Supplier" },
  { value: "customer", label: "Customer" },
  { value: "end_customer", label: "End Customer" },
  { value: "internal_warehouse", label: "Internal Warehouse" },
] as const;

type PartyFormAction = (
  prevState: PartyFormState,
  formData: FormData,
) => Promise<PartyFormState>;

interface PartyFormProps {
  action: PartyFormAction;
  party?: PartyDetail;
  cancelHref: string;
}

export function PartyForm({ action, party, cancelHref }: PartyFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  const isEdit = !!party;
  const assignedRoleValues = new Set(party?.roles.map((r) => r.role) ?? []);

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
      {/* Hidden fields for edit mode */}
      {isEdit && (
        <>
          <input type="hidden" name="id" value={party.id} />
          <input
            type="hidden"
            name="updatedAt"
            value={party.updatedAt.toISOString()}
          />
        </>
      )}

      {/* Global error / conflict message */}
      {state.error && (
        <div
          role="alert"
          className="mb-6 rounded border border-brand-red/30 bg-brand-red/5 px-4 py-3 font-body text-body-md text-brand-red"
        >
          {state.error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Code */}
        <div>
          <label
            htmlFor="code"
            className="block font-label text-label text-on-surface"
          >
            Organization Code{" "}
            <span aria-hidden="true" className="text-brand-red">
              *
            </span>
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            maxLength={50}
            defaultValue={party?.code ?? ""}
            placeholder="e.g. VENDOR-001"
            className={inputClass("code")}
            {...ariaProps("code")}
          />
          {fieldError("code")}
        </div>

        {/* Name */}
        <div>
          <label
            htmlFor="name"
            className="block font-label text-label text-on-surface"
          >
            Organization Name{" "}
            <span aria-hidden="true" className="text-brand-red">
              *
            </span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={255}
            defaultValue={party?.name ?? ""}
            placeholder="e.g. Acme Supplies Ltd."
            className={inputClass("name")}
            {...ariaProps("name")}
          />
          {fieldError("name")}
        </div>

        {/* Contact Person */}
        <div>
          <label
            htmlFor="contactPerson"
            className="block font-label text-label text-on-surface"
          >
            Contact Person
          </label>
          <input
            id="contactPerson"
            name="contactPerson"
            type="text"
            maxLength={255}
            defaultValue={party?.contactPerson ?? ""}
            className={inputClass("contactPerson")}
            {...ariaProps("contactPerson")}
          />
          {fieldError("contactPerson")}
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block font-label text-label text-on-surface"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={255}
            defaultValue={party?.email ?? ""}
            placeholder="contact@example.com"
            className={inputClass("email")}
            {...ariaProps("email")}
          />
          {fieldError("email")}
        </div>

        {/* Phone */}
        <div>
          <label
            htmlFor="phone"
            className="block font-label text-label text-on-surface"
          >
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            maxLength={50}
            defaultValue={party?.phone ?? ""}
            className={inputClass("phone")}
          />
        </div>

        {/* Tax ID */}
        <div>
          <label
            htmlFor="taxId"
            className="block font-label text-label text-on-surface"
          >
            Tax ID / TIN
          </label>
          <input
            id="taxId"
            name="taxId"
            type="text"
            maxLength={50}
            defaultValue={party?.taxId ?? ""}
            className={inputClass("taxId")}
          />
        </div>

        {/* Address */}
        <div className="md:col-span-2">
          <label
            htmlFor="address"
            className="block font-label text-label text-on-surface"
          >
            Address
          </label>
          <textarea
            id="address"
            name="address"
            rows={3}
            defaultValue={party?.address ?? ""}
            className={inputClass("address")}
          />
        </div>

        {/* Notes */}
        <div className="md:col-span-2">
          <label
            htmlFor="notes"
            className="block font-label text-label text-on-surface"
          >
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={party?.notes ?? ""}
            className={inputClass("notes")}
          />
        </div>

        {/* Active status */}
        <div className="flex items-center gap-3">
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            defaultChecked={party?.isActive ?? true}
            value="true"
            onChange={(e) => {
              // Set hidden field to false when unchecked
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
            value={party?.isActive ?? true ? "true" : "false"}
          />
        </div>

        {/* Business roles (create only — edit manages roles on detail page) */}
        {!isEdit && (
          <div className="md:col-span-2">
            <fieldset>
              <legend className="font-label text-label text-on-surface">
                Business Roles
                <span className="ml-2 font-body text-body-sm text-text-grey">
                  (Business classifications only — not application access)
                </span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {PARTY_ROLES.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 font-label text-label text-on-surface"
                  >
                    <input
                      type="checkbox"
                      name="roles"
                      value={value}
                      defaultChecked={assignedRoleValues.has(value)}
                      className="h-5 w-5 rounded border-outline-variant/30 text-brand-navy focus:ring-2 focus:ring-brand-navy"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
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
          className="flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
        >
          {isPending
            ? "Saving…"
            : isEdit
              ? "Save Changes"
              : "Create Organization"}
        </button>
      </div>
    </form>
  );
}
