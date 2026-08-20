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

const UOM_OPTIONS = ["piece", "roll", "meter"] as const;
const CURRENCY_OPTIONS = ["USD", "PHP"] as const;

// per page specs.md §8: Inventory Model is the UI name for the existing
// flow_type field (design.md 2026-08-14 terminology entry). It lives on
// item_categories, not items — selecting it here filters which categories
// are offered below, it does not submit its own form field.
const INVENTORY_MODEL_OPTIONS = ["vmi", "trading", "supplies"] as const;
const INVENTORY_MODEL_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

type ItemFormAction = (
  prevState: ItemFormState,
  formData: FormData,
) => Promise<ItemFormState>;

interface ItemFormProps {
  action: ItemFormAction;
  item?: ItemDetail;
  categories: CategoryOption[];
  supplierParties: SupplierPartyOption[];
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
  cancelHref,
}: ItemFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const isEdit = !!item;

  // Classification cascade: Inventory Model -> Category -> Subcategory.
  // Only `categoryId` (the most specific of Category/Subcategory chosen) is
  // ever submitted — Inventory Model and the Category/Subcategory split are
  // client-side filters over the existing flat item_categories list.
  const parentCategories = categories.filter((c) => !c.parentId);
  const childCategoriesByParent = new Map<string, CategoryOption[]>();
  for (const c of categories) {
    if (c.parentId) {
      const siblings = childCategoriesByParent.get(c.parentId) ?? [];
      siblings.push(c);
      childCategoriesByParent.set(c.parentId, siblings);
    }
  }

  const initialCategory = categories.find((c) => c.id === item?.categoryId);
  const initialParentId = initialCategory
    ? (initialCategory.parentId ?? initialCategory.id)
    : "";
  const initialSubcategoryId = initialCategory?.parentId
    ? initialCategory.id
    : "";
  const initialInventoryModel =
    (initialCategory?.parentId
      ? categories.find((c) => c.id === initialCategory.parentId)?.flowType
      : initialCategory?.flowType) ?? "";

  const [inventoryModel, setInventoryModel] = useState(initialInventoryModel);
  const [parentCategoryId, setParentCategoryId] = useState(initialParentId);
  const [subcategoryId, setSubcategoryId] = useState(initialSubcategoryId);

  // Primary identifier — conditional on Inventory Model (2026-08-19 user
  // request): VMI items are identified by Supplier Item Code, Trading items
  // by DSGC Item Number, never both shown at once. Each keeps its own value
  // so switching Inventory Model doesn't lose what was already typed. The
  // active one is mirrored into the DB's required `code` column (a separate,
  // internal Dyna-Serv identifier) via a hidden input below — the user
  // confirmed the conditional field itself should double as `code` rather
  // than requiring a redundant third value.
  const [codeValue, setCodeValue] = useState(item?.code ?? "");
  const [supplierItemCodeValue, setSupplierItemCodeValue] = useState(
    item?.supplierItemCode ?? "",
  );
  const [dsgcItemNumberValue, setDsgcItemNumberValue] = useState(
    item?.dsgcItemNumber ?? "",
  );
  const primaryCodeValue =
    inventoryModel === "vmi"
      ? supplierItemCodeValue
      : inventoryModel === "trading"
      ? dsgcItemNumberValue
      : codeValue;

  const categoryId = subcategoryId || parentCategoryId;

  const filteredParentCategories = inventoryModel
    ? parentCategories.filter(
      (c) => c.flowType === inventoryModel || !c.flowType,
    )
    : parentCategories;
  const subcategoryOptions = parentCategoryId
    ? (childCategoriesByParent.get(parentCategoryId) ?? [])
    : [];

  const [uom, setUom] = useState<string>(item?.uom ?? "piece");
  const [lengthCm, setLengthCm] = useState(item?.lengthCm ?? "");
  const [widthCm, setWidthCm] = useState(item?.widthCm ?? "");
  const [heightCm, setHeightCm] = useState(item?.heightCm ?? "");
  const [computedVolume, setComputedVolume] = useState<{
    cbm: string;
    cm3: string;
  } | null>(null);

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
        className="mt-1 font-body text-body-sm text-brand-red"
      >
        {state.fieldErrors[name]}
      </p>
    ) : null;

  const inputClass = (name: string) =>
    `mt-1 block w-full rounded border ${state.fieldErrors?.[name]
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
          className="mb-6 rounded border border-brand-red/30 bg-brand-red/5 px-4 py-3 font-body text-body-md text-brand-red"
        >
          {state.error}
        </div>
      )}

      {/* Section: Classification — per page specs.md §8 mandatory flow:
          Inventory Model -> Category -> Subcategory -> Item Code. Inventory
          Model/Category/Subcategory are cascading UI filters; only the most
          specific of Category/Subcategory is ever submitted, via the hidden
          categoryId input below. */}
      <section aria-labelledby="section-classification">
        <h2
          id="section-classification"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Classification
        </h2>
        <input type="hidden" name="categoryId" value={categoryId} />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="inventoryModel" className="block font-label text-label text-on-surface">
              Inventory Model
            </label>
            <select
              id="inventoryModel"
              value={inventoryModel}
              onChange={(e) => {
                setInventoryModel(e.target.value);
                setParentCategoryId("");
                setSubcategoryId("");
              }}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">All</option>
              {INVENTORY_MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {INVENTORY_MODEL_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="parentCategoryId" className="block font-label text-label text-on-surface">
              Category
            </label>
            <select
              id="parentCategoryId"
              value={parentCategoryId}
              onChange={(e) => {
                setParentCategoryId(e.target.value);
                setSubcategoryId("");
              }}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">None</option>
              {filteredParentCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="subcategoryId" className="block font-label text-label text-on-surface">
              Subcategory
            </label>
            <select
              id="subcategoryId"
              value={subcategoryId}
              onChange={(e) => setSubcategoryId(e.target.value)}
              disabled={subcategoryOptions.length === 0}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {subcategoryOptions.length === 0 ? "No subcategories" : "None"}
              </option>
              {subcategoryOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {inventoryModel === "vmi" ? (
            <div>
              <label htmlFor="supplierItemCode" className="block font-label text-label text-on-surface">
                Supplier Item Code{" "}
                <span aria-hidden="true" className="text-brand-red">*</span>
              </label>
              <input
                id="supplierItemCode"
                name="supplierItemCode"
                type="text"
                required
                maxLength={100}
                value={supplierItemCodeValue}
                onChange={(e) => setSupplierItemCodeValue(e.target.value)}
                placeholder="Supplier part number"
                className={inputClass("code")}
                {...ariaProps("code")}
              />
              <input type="hidden" name="code" value={primaryCodeValue} />
              {fieldError("code")}
              {fieldError("barcode")}
            </div>
          ) : inventoryModel === "trading" ? (
            <div>
              <label htmlFor="dsgcItemNumber" className="block font-label text-label text-on-surface">
                DSGC Item Number{" "}
                <span aria-hidden="true" className="text-brand-red">*</span>
              </label>
              <input
                id="dsgcItemNumber"
                name="dsgcItemNumber"
                type="text"
                required
                maxLength={100}
                value={dsgcItemNumberValue}
                onChange={(e) => setDsgcItemNumberValue(e.target.value)}
                placeholder="DSGC item number"
                className={inputClass("code")}
                {...ariaProps("code")}
              />
              <input type="hidden" name="code" value={primaryCodeValue} />
              {fieldError("code")}
              {fieldError("barcode")}
            </div>
          ) : (
            <div>
              <label htmlFor="code" className="block font-label text-label text-on-surface">
                Item Code{" "}
                <span aria-hidden="true" className="text-brand-red">*</span>
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                maxLength={100}
                value={codeValue}
                onChange={(e) => setCodeValue(e.target.value)}
                placeholder="e.g. ITM-00001"
                className={inputClass("code")}
                {...ariaProps("code")}
              />
              {fieldError("code")}
              {fieldError("barcode")}
            </div>
          )}
        </div>
      </section>

      {/* Section: Additional identifiers */}
      <section aria-labelledby="section-identifiers" className="mt-8">
        <h2
          id="section-identifiers"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Additional Identifiers
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="name" className="block font-label text-label text-on-surface">
              Item Name{" "}
              <span aria-hidden="true" className="text-brand-red">*</span>
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

          {inventoryModel !== "vmi" && inventoryModel !== "trading" && (
            <div>
              <label htmlFor="supplierItemCode-secondary" className="block font-label text-label text-on-surface">
                Supplier Item Code
              </label>
              <input
                id="supplierItemCode-secondary"
                name="supplierItemCode"
                type="text"
                maxLength={100}
                value={supplierItemCodeValue}
                onChange={(e) => setSupplierItemCodeValue(e.target.value)}
                className={inputClass("supplierItemCode")}
              />
            </div>
          )}

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

          {inventoryModel !== "vmi" && inventoryModel !== "trading" && (
            <div>
              <label htmlFor="dsgcItemNumber-secondary" className="block font-label text-label text-on-surface">
                DSGC Item Number
              </label>
              <input
                id="dsgcItemNumber-secondary"
                name="dsgcItemNumber"
                type="text"
                maxLength={100}
                value={dsgcItemNumberValue}
                onChange={(e) => setDsgcItemNumberValue(e.target.value)}
                className={inputClass("dsgcItemNumber")}
              />
            </div>
          )}

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
              <span aria-hidden="true" className="text-brand-red">*</span>
            </label>
            <select
              id="uom"
              name="uom"
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              {UOM_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            {fieldError("uom")}
          </div>

          <div>
            <label htmlFor="spq" className="block font-label text-label text-on-surface">
              SPQ (Standard Pkg Qty){" "}
              <span aria-hidden="true" className="text-brand-red">*</span>
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
                <span aria-hidden="true" className="text-brand-red">*</span>
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
        <p className="mb-4 font-body text-body-sm text-text-grey">
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
          <div className="mt-4 rounded border border-outline-variant/30 bg-surface-light-grey px-4 py-3">
            <p className="font-label text-label text-text-grey">
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
              <span aria-hidden="true" className="text-brand-red">*</span>
              <span className="ml-1 font-body text-body-sm text-text-grey">
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

      {/* Barcode is no longer manually enrolled (2026-08-19 user request):
          it's generated from the item code instead of a separate required
          field. On create, it tracks whatever the active code field
          currently holds; on edit, it stays frozen at the item's original
          value — the DB barcode-immutability guard (lib/enrollment/
          item-schema.ts's checkBarcodeUpdate, still enforced server-side)
          exists for exactly this "never changes after operational use"
          invariant, so an edit never submits a different value here. */}
      <input type="hidden" name="barcode" value={item?.barcode ?? primaryCodeValue} />

      {/* Section: Pricing (reference values) */}
      <section aria-labelledby="section-pricing" className="mt-8">
        <h2
          id="section-pricing"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Reference Prices
        </h2>
        <div className="mb-4 rounded border border-status-pending/30 bg-status-pending/5 px-4 py-3">
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
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
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

      {/* Section: Inventory settings */}
      <section aria-labelledby="section-inventory" className="mt-8">
        <h2
          id="section-inventory"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Inventory Settings
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="defaultSupplierPartyId" className="block font-label text-label text-on-surface">
              Default Supplier Organization
            </label>
            <select
              id="defaultSupplierPartyId"
              name="defaultSupplierPartyId"
              defaultValue={item?.defaultSupplierPartyId ?? ""}
              required
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">Select organization…</option>
              {supplierParties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              The default organization this item belongs to. It is used when preparing receiving and pick-list workflows.
            </p>
          </div>

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
              className="h-5 w-5 rounded border-outline-variant/30 text-brand-navy focus:ring-2 focus:ring-brand-navy"
            />
            <label htmlFor="isPerishable" className="font-label text-label text-on-surface">
              Perishable
            </label>
            <input
              type="hidden"
              name="isPerishable"
              value={item?.isPerishable ? "true" : "false"}
            />
            <p className="font-body text-body-sm text-text-grey">
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
              className="h-5 w-5 rounded border-outline-variant/30 text-brand-navy focus:ring-2 focus:ring-brand-navy"
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
          className="flex h-11 items-center justify-center rounded bg-brand-navy px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center justify-center rounded bg-primary px-6 font-label text-label text-surface-white hover:bg-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
        >
          {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Item"}
        </button>
      </div>
    </form>
  );
}
