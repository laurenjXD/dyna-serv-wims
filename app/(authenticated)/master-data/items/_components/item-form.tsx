"use client";

// Item create/edit form with conditional field logic:
//   - spqMeter shown only when uom === 'roll'
//   - Dimension fields show computed volume_cbm preview
//   - Client-side label preview for computed fields
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §6
//   lib/enrollment/item-schema.ts — computeItemVolumes, field rules

import { useActionState, useState, useEffect } from "react";
import Link from "next/link";
import type { ItemFormState } from "../_actions";
import type { ItemDetail, CategoryOption, SupplierPartyOption } from "@/lib/db/queries/items";

const ITEM_TYPES = [
  "standard",
  "raw_material",
  "packaging",
  "fabrication",
  "spare_parts",
  "machines",
] as const;

const UOM_OPTIONS = ["piece", "roll", "meter"] as const;
const CURRENCY_OPTIONS = ["USD", "PHP"] as const;

type ItemFormAction = (
  prevState: ItemFormState,
  formData: FormData,
) => Promise<ItemFormState>;

interface ItemFormProps {
  action: ItemFormAction;
  item?: ItemDetail;
  categories: CategoryOption[];
  supplierParties: SupplierPartyOption[];
  barcodeEditable: boolean;
  cancelHref: string;
}

function computeVolumeCbm(
  length: string,
  width: string,
  height: string,
): { cbm: string; cm3: string } | null {
  const l = parseFloat(length);
  const w = parseFloat(width);
  const h = parseFloat(height);
  if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0) {
    return null;
  }
  const raw = l * w * h;
  const cm3 = String(Math.round(raw * 100) / 100);
  const cbm = String(Math.round((raw / 1_000_000) * 10000) / 10000);
  return { cbm, cm3 };
}

export function ItemForm({
  action,
  item,
  categories,
  supplierParties,
  barcodeEditable,
  cancelHref,
}: ItemFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const isEdit = !!item;

  const initialCategory = categories.find((c) => c.id === item?.categoryId);
  const initialFlowType = initialCategory?.flowType ?? "vmi";
  const [flowType, setFlowType] = useState<string>(initialFlowType);

  const [uom, setUom] = useState<string>(item?.uom ?? "piece");
  const [lengthCm, setLengthCm] = useState(item?.lengthCm ?? "");
  const [widthCm, setWidthCm] = useState(item?.widthCm ?? "");
  const [heightCm, setHeightCm] = useState(item?.heightCm ?? "");
  const [computedVolume, setComputedVolume] = useState<{
    cbm: string;
    cm3: string;
  } | null>(null);

  const filteredCategories = categories.filter((cat) => cat.flowType === flowType || !cat.flowType);

  useEffect(() => {
    if (lengthCm && widthCm && heightCm) {
      const result = computeVolumeCbm(
        String(lengthCm),
        String(widthCm),
        String(heightCm),
      );
      setComputedVolume(result);
    } else {
      setComputedVolume(null);
    }
  }, [lengthCm, widthCm, heightCm]);

  const showSpqMeter = uom === "roll";

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? (
      <p
        id={`${name}-error`}
        role="alert"
        className="mt-1 font-body text-body-sm text-action-blue"
      >
        {state.fieldErrors[name]}
      </p>
    ) : null;

  const inputClass = (name: string) =>
    `mt-1 block w-full rounded border ${
      state.fieldErrors?.[name]
        ? "border-action-blue"
        : "border-outline-variant/30"
    } bg-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-primary`;

  const ariaProps = (name: string) =>
    state.fieldErrors?.[name]
      ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` }
      : {};

  return (
    <form action={formAction} noValidate>
      {isEdit && (
        <>
          <input type="hidden" name="id" value={item.id} />
          <input
            type="hidden"
            name="updatedAt"
            value={item.updatedAt.toISOString()}
          />
        </>
      )}

      {state.error && (
        <div
          role="alert"
          className="mb-6 rounded border border-action-blue/30 bg-action-blue/5 px-4 py-3 font-body text-body-md text-action-blue"
        >
          {state.error}
        </div>
      )}

      {/* Section: Flow Type */}
      <section aria-labelledby="section-flow-type" className="mb-8">
        <h2
          id="section-flow-type"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Flow Type
        </h2>
        <div>
          <label htmlFor="flowType" className="block font-label text-label text-on-surface">
            Flow Type <span aria-hidden="true" className="text-action-blue">*</span>
          </label>
          <select
            id="flowType"
            name="flowType"
            value={flowType}
            onChange={(e) => setFlowType(e.target.value)}
            className="mt-1 block w-full max-w-sm rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="vmi">VMI (Vendor Managed Inventory)</option>
            <option value="trading">Trading</option>
            <option value="supplies">Supplies</option>
          </select>
          <p className="mt-1 font-body text-body-sm text-on-surface-variant">
            Determines the available categories and flow-specific fields.
          </p>
        </div>
      </section>

      {/* Section: Core identifiers */}
      <section aria-labelledby="section-identifiers">
        <h2
          id="section-identifiers"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Identifiers
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="code" className="block font-label text-label text-on-surface">
              Item Code{" "}
              <span aria-hidden="true" className="text-action-blue">*</span>
            </label>
            <input
              id="code"
              name="code"
              type="text"
              required
              maxLength={100}
              defaultValue={item?.code ?? ""}
              placeholder="e.g. ITM-00001"
              className={inputClass("code")}
              {...ariaProps("code")}
            />
            {fieldError("code")}
          </div>

          <div>
            <label htmlFor="barcode" className="block font-label text-label text-on-surface">
              Barcode{" "}
              <span aria-hidden="true" className="text-action-blue">*</span>
            </label>
            <input
              id="barcode"
              name="barcode"
              type="text"
              required
              maxLength={100}
              defaultValue={item?.barcode ?? ""}
              disabled={!barcodeEditable}
              className={`${inputClass("barcode")} ${!barcodeEditable ? "cursor-not-allowed opacity-60" : ""}`}
              {...ariaProps("barcode")}
            />
            {!barcodeEditable && (
              <p className="mt-1 font-body text-body-sm text-status-neutral">
                Barcode cannot be changed after operational use.
              </p>
            )}
            {fieldError("barcode")}
          </div>

          <div>
            <label htmlFor="name" className="block font-label text-label text-on-surface">
              Item Name{" "}
              <span aria-hidden="true" className="text-action-blue">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={255}
              defaultValue={item?.name ?? ""}
              className={inputClass("name")}
              {...ariaProps("name")}
            />
            {fieldError("name")}
          </div>

          <div>
            <label htmlFor="itemType" className="block font-label text-label text-on-surface">
              Item Type
            </label>
            <select
              id="itemType"
              name="itemType"
              defaultValue={item?.itemType ?? "standard"}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="supplierItemCode" className="block font-label text-label text-on-surface">
              Supplier Item Code
            </label>
            <input
              id="supplierItemCode"
              name="supplierItemCode"
              type="text"
              maxLength={100}
              defaultValue={item?.supplierItemCode ?? ""}
              className={inputClass("supplierItemCode")}
            />
          </div>

          <div>
            <label htmlFor="customerItemCode" className="block font-label text-label text-on-surface">
              Customer Item Code
            </label>
            <input
              id="customerItemCode"
              name="customerItemCode"
              type="text"
              maxLength={100}
              defaultValue={item?.customerItemCode ?? ""}
              className={inputClass("customerItemCode")}
            />
          </div>

          <div>
            <label htmlFor="dsgcItemNumber" className="block font-label text-label text-on-surface">
              DSGC Item Number
            </label>
            <input
              id="dsgcItemNumber"
              name="dsgcItemNumber"
              type="text"
              maxLength={100}
              defaultValue={item?.dsgcItemNumber ?? ""}
              className={inputClass("dsgcItemNumber")}
            />
          </div>

          <div>
            <label htmlFor="categoryId" className="block font-label text-label text-on-surface">
              Category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={item?.categoryId ?? ""}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">None</option>
              {filteredCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="description" className="block font-label text-label text-on-surface">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={item?.description ?? ""}
              className={inputClass("description")}
            />
          </div>
        </div>
      </section>

      {/* Section: UOM and packaging */}
      <section aria-labelledby="section-packaging" className="mt-8">
        <h2
          id="section-packaging"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Packaging &amp; UOM
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="uom" className="block font-label text-label text-on-surface">
              Unit of Measure{" "}
              <span aria-hidden="true" className="text-action-blue">*</span>
            </label>
            <select
              id="uom"
              name="uom"
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {UOM_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            {fieldError("uom")}
          </div>

          {flowType === "vmi" && (
            <>
              <div>
                <label htmlFor="spq" className="block font-label text-label text-on-surface">
                  SPQ (Standard Pkg Qty){" "}
                  <span aria-hidden="true" className="text-action-blue">*</span>
                </label>
                <input
                  id="spq"
                  name="spq"
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue={item?.spq ?? 1}
                  className={inputClass("spq")}
                  {...ariaProps("spq")}
                />
                {fieldError("spq")}
              </div>

              {showSpqMeter && (
                <div>
                  <label htmlFor="spqMeter" className="block font-label text-label text-on-surface">
                    SPQ Meter (m/roll){" "}
                    <span aria-hidden="true" className="text-action-blue">*</span>
                  </label>
                  <input
                    id="spqMeter"
                    name="spqMeter"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={item?.spqMeter ?? ""}
                    className={inputClass("spqMeter")}
                    {...ariaProps("spqMeter")}
                  />
                  {fieldError("spqMeter")}
                </div>
              )}
            </>
          )}

          <div>
            <label htmlFor="boxesPerPallet" className="block font-label text-label text-on-surface">
              Boxes per Pallet
            </label>
            <input
              id="boxesPerPallet"
              name="boxesPerPallet"
              type="number"
              min="1"
              step="1"
              defaultValue={item?.boxesPerPallet ?? ""}
              className={inputClass("boxesPerPallet")}
              {...ariaProps("boxesPerPallet")}
            />
            {fieldError("boxesPerPallet")}
          </div>

          <div>
            <label htmlFor="weightKg" className="block font-label text-label text-on-surface">
              Weight (kg)
            </label>
            <input
              id="weightKg"
              name="weightKg"
              type="number"
              min="0"
              step="0.001"
              defaultValue={item?.weightKg ?? ""}
              className={inputClass("weightKg")}
            />
          </div>
        </div>
      </section>

      {/* Section: Dimensions and volume */}
      <section aria-labelledby="section-dimensions" className="mt-8">
        <h2
          id="section-dimensions"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Dimensions &amp; Volume
        </h2>
        <p className="mb-4 font-body text-body-sm text-on-surface-variant">
          If you provide any dimension, all three must be provided. Volume CBM
          is auto-computed from dimensions; provide it directly if dimensions
          are not yet known.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="lengthCm" className="block font-label text-label text-on-surface">
              Length (cm)
            </label>
            <input
              id="lengthCm"
              name="lengthCm"
              type="number"
              min="0.01"
              step="0.01"
              value={lengthCm}
              onChange={(e) => setLengthCm(e.target.value)}
              className={inputClass("lengthCm")}
              {...ariaProps("lengthCm")}
            />
            {fieldError("lengthCm")}
          </div>

          <div>
            <label htmlFor="widthCm" className="block font-label text-label text-on-surface">
              Width (cm)
            </label>
            <input
              id="widthCm"
              name="widthCm"
              type="number"
              min="0.01"
              step="0.01"
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              className={inputClass("widthCm")}
              {...ariaProps("widthCm")}
            />
            {fieldError("widthCm")}
          </div>

          <div>
            <label htmlFor="heightCm" className="block font-label text-label text-on-surface">
              Height (cm)
            </label>
            <input
              id="heightCm"
              name="heightCm"
              type="number"
              min="0.01"
              step="0.01"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className={inputClass("heightCm")}
              {...ariaProps("heightCm")}
            />
            {fieldError("heightCm")}
          </div>
        </div>

        {/* Computed volume preview */}
        {computedVolume ? (
          <div className="mt-4 rounded border border-outline-variant/30 bg-surface-dim px-4 py-3">
            <p className="font-label text-label text-on-surface-variant">
              Computed from dimensions:
            </p>
            <p className="mt-1 font-mono text-mono-md text-on-surface">
              Volume CBM:{" "}
              <span className="font-bold">{computedVolume.cbm}</span> m³ (
              {computedVolume.cm3} cm³)
            </p>
            <input
              type="hidden"
              name="volumeCbm"
              value={computedVolume.cbm}
            />
          </div>
        ) : (
          <div className="mt-4">
            <label htmlFor="volumeCbm" className="block font-label text-label text-on-surface">
              Volume CBM{" "}
              <span aria-hidden="true" className="text-action-blue">*</span>
              <span className="ml-1 font-body text-body-sm text-on-surface-variant">
                (required when dimensions not provided)
              </span>
            </label>
            <input
              id="volumeCbm"
              name="volumeCbm"
              type="number"
              min="0.0001"
              step="0.0001"
              defaultValue={item?.volumeCbm ?? ""}
              className={inputClass("volumeCbm")}
              {...ariaProps("volumeCbm")}
            />
            {fieldError("volumeCbm")}
          </div>
        )}
      </section>

      {/* Section: Pricing (reference values) */}
      {flowType === "trading" && (
        <section aria-labelledby="section-pricing" className="mt-8">
          <h2
            id="section-pricing"
            className="mb-4 font-heading font-semibold text-data-display text-on-surface"
          >
            Reference Prices
          </h2>
          <div className="mb-4 rounded border border-status-warning/30 bg-status-warning/5 px-4 py-3">
            <p className="font-body text-body-md text-on-surface">
              <strong>Reference values only.</strong> These prices do not directly
              determine any Trading document price or VMI billing amount. Final
              pricing is resolved by the respective workflow (spec 12/13).
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="currency" className="block font-label text-label text-on-surface">
                Currency
              </label>
              <select
                id="currency"
                name="currency"
                defaultValue={item?.currency ?? "USD"}
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="buyingPrice" className="block font-label text-label text-on-surface">
                Buying Price (reference)
              </label>
              <input
                id="buyingPrice"
                name="buyingPrice"
                type="number"
                min="0"
                step="0.0001"
                defaultValue={item?.buyingPrice ?? ""}
                className={inputClass("buyingPrice")}
              />
            </div>

            <div>
              <label htmlFor="sellingPrice" className="block font-label text-label text-on-surface">
                Selling Price (reference)
              </label>
              <input
                id="sellingPrice"
                name="sellingPrice"
                type="number"
                min="0"
                step="0.0001"
                defaultValue={item?.sellingPrice ?? ""}
                className={inputClass("sellingPrice")}
              />
            </div>
          </div>
        </section>
      )}

      {/* Section: Inventory settings */}
      <section aria-labelledby="section-inventory" className="mt-8">
        <h2
          id="section-inventory"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Inventory Settings
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {flowType === "vmi" && (
            <div>
              <label htmlFor="defaultSupplierPartyId" className="block font-label text-label text-on-surface">
                Default Supplier Party
              </label>
              <select
                id="defaultSupplierPartyId"
                name="defaultSupplierPartyId"
                defaultValue={item?.defaultSupplierPartyId ?? ""}
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">None</option>
                {supplierParties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 font-body text-body-sm text-on-surface-variant">
                Active parties with vendor or supplier role only.
              </p>
            </div>
          )}

          {flowType === "supplies" && (
            <div>
              <label htmlFor="minReorderLevel" className="block font-label text-label text-on-surface">
                Min Reorder Level
              </label>
              <input
                id="minReorderLevel"
                name="minReorderLevel"
                type="number"
                min="0"
                step="1"
                defaultValue={item?.minReorderLevel ?? 0}
                className={inputClass("minReorderLevel")}
                {...ariaProps("minReorderLevel")}
              />
              {fieldError("minReorderLevel")}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              id="isPerishable"
              name="isPerishable"
              type="checkbox"
              defaultChecked={item?.isPerishable ?? false}
              value="true"
              onChange={(e) => {
                const hiddenInput = e.currentTarget
                  .closest("form")
                  ?.querySelector<HTMLInputElement>(
                    'input[name="isPerishable"][type="hidden"]',
                  );
                if (hiddenInput) {
                  hiddenInput.value = e.currentTarget.checked ? "true" : "false";
                }
              }}
              className="h-5 w-5 rounded border-outline-variant/30 text-primary focus:ring-2 focus:ring-primary"
            />
            <label htmlFor="isPerishable" className="font-label text-label text-on-surface">
              Perishable
            </label>
            <input
              type="hidden"
              name="isPerishable"
              value={item?.isPerishable ? "true" : "false"}
            />
            <p className="font-body text-body-sm text-on-surface-variant">
              Triggers mandatory expiry/manufacture date capture at receiving.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="isActive"
              name="isActive"
              type="checkbox"
              defaultChecked={item?.isActive ?? true}
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
              className="h-5 w-5 rounded border-outline-variant/30 text-primary focus:ring-2 focus:ring-primary"
            />
            <label htmlFor="isActive" className="font-label text-label text-on-surface">
              Active
            </label>
            <input
              type="hidden"
              name="isActive"
              value={item?.isActive ?? true ? "true" : "false"}
            />
          </div>
        </div>
      </section>

      {/* Form actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Link
          href={cancelHref}
          className="flex h-11 items-center justify-center rounded bg-primary px-6 font-label text-label text-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-action-blue"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center justify-center rounded bg-action-blue px-6 font-label text-label text-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        >
          {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Item"}
        </button>
      </div>
    </form>
  );
}
