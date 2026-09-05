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
import { RefreshCw, Plus, Pencil, Check, X } from "lucide-react";
import type { ItemFormState } from "../_actions";
import { createCategoryAction, updateCategoryAction } from "../_actions";
import type { ItemDetail, CategoryOption, SupplierPartyOption } from "@/lib/db/queries/items";

const STANDARD_UOM_OPTIONS = [
  "piece",
  "roll",
  "meter",
] as const;
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
  initialCode?: string;
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
  initialCode = "",
}: ItemFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const isEdit = !!item;

  // Local categories list for dynamic on-the-fly addition and editing
  const [localCategories, setLocalCategories] = useState<CategoryOption[]>(categories);

  // Organization selection & auto-assigned inventory model state
  const [selectedPartyId, setSelectedPartyId] = useState(item?.defaultSupplierPartyId ?? "");
  const [autoAssignedInfo, setAutoAssignedInfo] = useState<string | null>(() => {
    if (item?.defaultSupplierPartyId) {
      const p = supplierParties.find((party) => party.id === item.defaultSupplierPartyId);
      if (p?.defaultInventoryModel) {
        return `Auto-assigned from ${p.code} (${p.roles?.join(", ") || "Party Role"}): ${INVENTORY_MODEL_LABELS[p.defaultInventoryModel]}`;
      }
    }
    return null;
  });

  // Modal / Inline Drawer states for Category & Subcategory Management
  const [categoryModal, setCategoryModal] = useState<{
    mode: "add_category" | "edit_category" | "add_subcategory" | "edit_subcategory" | null;
    targetId?: string;
    name: string;
    flowType: string;
    parentId?: string | null;
    loading?: boolean;
    error?: string | null;
  }>({
    mode: null,
    name: "",
    flowType: "",
  });

  // Classification cascade: Inventory Model -> Category -> Subcategory.
  const parentCategories = localCategories.filter((c) => !c.parentId);
  const childCategoriesByParent = new Map<string, CategoryOption[]>();
  for (const c of localCategories) {
    if (c.parentId) {
      const siblings = childCategoriesByParent.get(c.parentId) ?? [];
      siblings.push(c);
      childCategoriesByParent.set(c.parentId, siblings);
    }
  }

  const initialCategory = localCategories.find((c) => c.id === item?.categoryId);
  const initialParentId = initialCategory
    ? (initialCategory.parentId ?? initialCategory.id)
    : "";
  const initialSubcategoryId = initialCategory?.parentId
    ? initialCategory.id
    : "";
  const initialInventoryModel =
    (initialCategory?.parentId
      ? localCategories.find((c) => c.id === initialCategory.parentId)?.flowType
      : initialCategory?.flowType) ?? "";

  const [inventoryModel, setInventoryModel] = useState(initialInventoryModel);
  const [movementCategory, setMovementCategory] = useState<string>(
    item?.vmiMovementCategory ?? "fg",
  );
  const [parentCategoryId, setParentCategoryId] = useState(initialParentId);
  const [subcategoryId, setSubcategoryId] = useState(initialSubcategoryId);

  // Primary identifier — conditional on Inventory Model
  const [codeValue, setCodeValue] = useState(item?.code ?? initialCode);
  const [supplierItemCodeValue, setSupplierItemCodeValue] = useState(
    item?.supplierItemCode ?? initialCode,
  );
  const [dsgcItemNumberValue, setDsgcItemNumberValue] = useState(
    item?.dsgcItemNumber ?? initialCode,
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

  // Group parent categories by Finished Goods (FG) vs Raw Materials (RAW)
  const rawMaterialKeywords = ["raw material", "raw", "resin", "polysheet", "chemical", "chemicals", "esd"];
  const fgCategories = filteredParentCategories.filter(
    (c) => !rawMaterialKeywords.some((kw) => c.name.toLowerCase().includes(kw)),
  );
  const rawCategories = filteredParentCategories.filter(
    (c) => rawMaterialKeywords.some((kw) => c.name.toLowerCase().includes(kw)),
  );

  const subcategoryOptions = parentCategoryId
    ? (childCategoriesByParent.get(parentCategoryId) ?? [])
    : [];

  const suggestedDsgcPartNumber = "DSGC-TRD-0001";
  const initialUom = item?.uom ?? "piece";
  const isCustomInitialUom = !STANDARD_UOM_OPTIONS.includes(initialUom as (typeof STANDARD_UOM_OPTIONS)[number]) && !!initialUom;
  const [customUomMode, setCustomUomMode] = useState(isCustomInitialUom);
  const [customUomText, setCustomUomText] = useState(isCustomInitialUom ? initialUom : "");
  const [uom, setUom] = useState<string>(initialUom);
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

  const isTradingModel = inventoryModel === "trading";

  const [spqMeterInput, setSpqMeterInput] = useState(item?.spqMeter ? String(item.spqMeter) : (item ? "" : "750"));

  useEffect(() => {
    if (inventoryModel === "trading" && !spqMeterInput) {
      setSpqMeterInput("750");
    }
  }, [inventoryModel, spqMeterInput]);

  const showSpqMeter = uom === "roll" || uom === "meter";

  const [calcRolls, setCalcRolls] = useState("1");
  const [calcMeters, setCalcMeters] = useState("");

  const effectiveSpqMeterStr = isTradingModel ? "750" : spqMeterInput;
  const factor = parseFloat(effectiveSpqMeterStr);
  const isValidFactor = !isNaN(factor) && factor > 0;

  const handleRollsChange = (val: string) => {
    setCalcRolls(val);
    const r = parseFloat(val);
    if (!isNaN(r) && isValidFactor) {
      setCalcMeters(String(Math.round(r * factor * 100) / 100));
    } else {
      setCalcMeters("");
    }
  };

  const handleMetersChange = (val: string) => {
    setCalcMeters(val);
    const m = parseFloat(val);
    if (!isNaN(m) && isValidFactor) {
      setCalcRolls(String(Math.round((m / factor) * 10000) / 10000));
    } else {
      setCalcRolls("");
    }
  };

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

      {/* Section: Classification — per workflow:
          1. Inventory Model -> 2. Category (based on model) -> [Beside it] FG/RAW Classification -> 3. Subcategory (Last in Hierarchy). */}
      <section aria-labelledby="section-classification">
        <h2
          id="section-classification"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Classification &amp; Hierarchy
        </h2>
        <input type="hidden" name="categoryId" value={categoryId} />
        
        {/* Real-time Category Hierarchy Breadcrumb Bar */}
        <div className="mb-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold uppercase tracking-wider text-brand-navy text-[10px]">
              Hierarchy Flow:
            </span>
            <span className="inline-flex items-center rounded-md bg-slate-200/90 px-2 py-0.5 text-[11px] font-bold text-slate-800">
              Model: {inventoryModel ? INVENTORY_MODEL_LABELS[inventoryModel] || inventoryModel.toUpperCase() : "All Models"}
            </span>
            <span className="text-slate-400">➔</span>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${parentCategoryId ? "bg-emerald-100 text-emerald-900 border border-emerald-200" : "bg-slate-200/80 text-slate-500 italic"}`}>
              Category: {localCategories.find((c) => c.id === parentCategoryId)?.name || "Not Selected"}
            </span>
            <span className="text-slate-400">➔</span>
            <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-900">
              Type: {movementCategory === "fg" ? "Finished Goods (FG)" : movementCategory === "raw_material" ? "Raw Materials (RAW)" : movementCategory === "for_process" ? "Work in Process (WIP)" : movementCategory === "reject" ? "Rejects" : "Quality Hold"}
            </span>
            <span className="text-slate-400">➔</span>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${subcategoryId ? "bg-indigo-100 text-indigo-950 border border-indigo-200" : "bg-slate-200/80 text-slate-500 italic"}`}>
              Subcategory (Last): {localCategories.find((c) => c.id === subcategoryId)?.name || (parentCategoryId ? "None (Category Level)" : "Not Selected")}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Owner / Default Supplier Organization */}
          <div>
            <label htmlFor="defaultSupplierPartyId" className="block font-label text-label text-on-surface">
              Owner / Default Supplier Organization{" "}
              <span aria-hidden="true" className="text-brand-red">*</span>
            </label>
            <select
              id="defaultSupplierPartyId"
              name="defaultSupplierPartyId"
              value={selectedPartyId}
              onChange={(e) => {
                const partyId = e.target.value;
                setSelectedPartyId(partyId);
                const org = supplierParties.find((p) => p.id === partyId);
                if (org?.defaultInventoryModel) {
                  setInventoryModel(org.defaultInventoryModel);
                  setAutoAssignedInfo(
                    `Auto-assigned: ${INVENTORY_MODEL_LABELS[org.defaultInventoryModel]} (${org.roles?.join(", ") || "Party Role"})`
                  );
                } else {
                  setAutoAssignedInfo(null);
                }
              }}
              required
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">Select organization…</option>
              {supplierParties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} {p.roles && p.roles.length > 0 ? `(${p.roles.join(", ")})` : ""}
                </option>
              ))}
            </select>
            {fieldError("defaultSupplierPartyId")}
          </div>

          {/* Inventory Model */}
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
                setAutoAssignedInfo(null);
              }}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">All Models</option>
              {INVENTORY_MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {INVENTORY_MODEL_LABELS[m]}
                </option>
              ))}
            </select>
            {autoAssignedInfo && (
              <span className="mt-1.5 inline-block text-[11px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {autoAssignedInfo}
              </span>
            )}
          </div>

          {/* Category (Filtered based on Inventory Model) */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="parentCategoryId" className="block font-label text-label text-on-surface font-bold">
                Category
              </label>
              <button
                type="button"
                onClick={() => {
                  setCategoryModal({
                    mode: "add_category",
                    name: "",
                    flowType: inventoryModel || "",
                    error: null,
                  });
                }}
                className="text-xs font-bold text-brand-navy hover:underline flex items-center gap-1"
              >
                <Plus size={13} /> Add Category
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <select
                id="parentCategoryId"
                value={parentCategoryId}
                onChange={(e) => {
                  if (e.target.value === "__NEW_CATEGORY__") {
                    setCategoryModal({
                      mode: "add_category",
                      name: "",
                      flowType: inventoryModel || "",
                      error: null,
                    });
                    return;
                  }
                  setParentCategoryId(e.target.value);
                  setSubcategoryId("");
                }}
                className="block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <option value="">None (Select Category)</option>
                {fgCategories.length > 0 && (
                  <optgroup label="Finished Goods (FG) Categories">
                    {fgCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {rawCategories.length > 0 && (
                  <optgroup label="Raw Materials (RAW) Categories">
                    {rawCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="__NEW_CATEGORY__" className="text-brand-navy font-bold">
                  + Add New Category...
                </option>
              </select>
              {parentCategoryId && (
                <button
                  type="button"
                  title="Edit selected category"
                  onClick={() => {
                    const cat = localCategories.find((c) => c.id === parentCategoryId);
                    if (cat) {
                      setCategoryModal({
                        mode: "edit_category",
                        targetId: cat.id,
                        name: cat.name,
                        flowType: cat.flowType || "",
                        error: null,
                      });
                    }
                  }}
                  className="h-10 w-10 shrink-0 flex items-center justify-center rounded border border-outline-variant/30 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          </div>

          {/* FG or RAW Classification */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="vmiMovementCategory" className="block font-label text-label text-on-surface font-bold">
                FG / RAW Classification <span aria-hidden="true" className="text-brand-red">*</span>
              </label>
            </div>
            <select
              id="vmiMovementCategory"
              name="vmiMovementCategory"
              value={movementCategory}
              onChange={(e) => setMovementCategory(e.target.value)}
              className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="fg">Finished Goods (FG)</option>
              <option value="raw_material">Raw Materials (RAW)</option>
              <option value="for_process">Work in Process (WIP)</option>
              <option value="reject">Rejects &amp; Scrap</option>
              <option value="re_inspect">Quality Hold / Re-Inspection</option>
            </select>
          </div>

          {/* Subcategory (Last in Hierarchy) */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="subcategoryId" className="block font-label text-label text-on-surface font-bold">
                Subcategory <span className="text-xs font-semibold text-brand-navy bg-brand-navy/10 px-1.5 py-0.5 rounded">Last in Hierarchy</span>
              </label>
              {parentCategoryId && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryModal({
                      mode: "add_subcategory",
                      name: "",
                      flowType: inventoryModel || "",
                      parentId: parentCategoryId,
                      error: null,
                    });
                  }}
                  className="text-xs font-bold text-brand-navy hover:underline flex items-center gap-1"
                >
                  <Plus size={13} /> Add Subcategory
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <select
                id="subcategoryId"
                value={subcategoryId}
                onChange={(e) => {
                  if (e.target.value === "__NEW_SUBCATEGORY__") {
                    setCategoryModal({
                      mode: "add_subcategory",
                      name: "",
                      flowType: inventoryModel || "",
                      parentId: parentCategoryId,
                      error: null,
                    });
                    return;
                  }
                  setSubcategoryId(e.target.value);
                }}
                disabled={!parentCategoryId}
                className="block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {!parentCategoryId
                    ? "Select a category first"
                    : subcategoryOptions.length === 0
                    ? "None (No subcategories configured)"
                    : "None (Keep parent category)"}
                </option>
                {subcategoryOptions.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
                {parentCategoryId && (
                  <option value="__NEW_SUBCATEGORY__" className="text-brand-navy font-bold">
                    + Add New Subcategory...
                  </option>
                )}
              </select>
              {subcategoryId && (
                <button
                  type="button"
                  title="Edit selected subcategory"
                  onClick={() => {
                    const cat = localCategories.find((c) => c.id === subcategoryId);
                    if (cat) {
                      setCategoryModal({
                        mode: "edit_subcategory",
                        targetId: cat.id,
                        name: cat.name,
                        flowType: cat.flowType || "",
                        parentId: parentCategoryId,
                        error: null,
                      });
                    }
                  }}
                  className="h-10 w-10 shrink-0 flex items-center justify-center rounded border border-outline-variant/30 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
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
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !e.shiftKey && !dsgcItemNumberValue) {
                    setDsgcItemNumberValue(suggestedDsgcPartNumber);
                  }
                }}
                onChange={(e) => setDsgcItemNumberValue(e.target.value)}
                placeholder={suggestedDsgcPartNumber}
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
              placeholder="e.g. Hex Bolt M8x25"
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
                placeholder="e.g. SUP-PART-001"
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
              placeholder="e.g. CUST-PART-001"
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
                placeholder="e.g. DSGC-TRD-00001"
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
              rows={2}
              defaultValue={item?.description ?? ""}
              placeholder="Brief description or item specifications..."
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
            <div className="flex items-center justify-between">
              <label htmlFor="uom" className="block font-label text-label text-on-surface">
                Unit of Measure{" "}
                <span aria-hidden="true" className="text-brand-red">*</span>
              </label>
              {customUomMode && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomUomMode(false);
                    setUom("piece");
                  }}
                  className="text-body-xs font-semibold text-brand-navy hover:underline focus:outline-none"
                >
                  Back to dropdown
                </button>
              )}
            </div>
            {customUomMode ? (
              <input
                id="uom"
                name="uom"
                type="text"
                required
                value={customUomText}
                onChange={(e) => {
                  setCustomUomText(e.target.value);
                  setUom(e.target.value);
                }}
                placeholder="Enter custom UOM (e.g. bundle, drum, sheet)"
                className={inputClass("uom")}
                {...ariaProps("uom")}
              />
            ) : (
              <select
                id="uom"
                name="uom"
                value={uom}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomUomMode(true);
                    setCustomUomText("");
                  } else {
                    setUom(e.target.value);
                  }
                }}
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                {STANDARD_UOM_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                <option value="__custom__">+ Add Custom Measurement...</option>
              </select>
            )}
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
              placeholder="e.g. 100"
              className={inputClass("spq")}
              {...ariaProps("spq")}
            />
            {fieldError("spq")}
          </div>

          {showSpqMeter && (
            <div>
              <label htmlFor="spqMeter" className="block font-label text-label text-on-surface">
                SPQ Meter (m/roll){" "}
                {(uom === "roll" || isTradingModel) && <span aria-hidden="true" className="text-brand-red">*</span>}
              </label>
              <input
                id="spqMeter"
                name="spqMeter"
                type="number"
                min="0.01"
                step="0.01"
                value={spqMeterInput}
                onChange={(e) => {
                  setSpqMeterInput(e.target.value);
                  const f = parseFloat(e.target.value);
                  if (!isNaN(f) && f > 0) {
                    const r = parseFloat(calcRolls || "1");
                    if (!isNaN(r)) setCalcMeters(String(Math.round(r * f * 100) / 100));
                  }
                }}
                placeholder="e.g. 750"
                className={inputClass("spqMeter")}
                {...ariaProps("spqMeter")}
              />
              <p className="mt-1 font-body text-body-sm text-text-grey">
                {isTradingModel
                  ? "Suggested default: 750 m/roll for Trading (configurable)."
                  : "Enter custom SPQ Meter (m/roll) for VMI."}
              </p>
              {fieldError("spqMeter")}
            </div>
          )}

          {showSpqMeter && (
            <div className="md:col-span-3 rounded-lg border border-brand-navy/20 bg-brand-navy/5 p-4 mt-2">
              <div className="flex items-center gap-2">
                <RefreshCw size={18} className="text-brand-navy" />
                <h4 className="font-heading text-title-sm font-bold text-on-surface">
                  Automatic Roll <span className="text-brand-navy">↔</span> Meter Unit Conversion
                </h4>
              </div>
              <p className="mt-1 font-body text-body-sm text-text-grey">
                {uom === "roll"
                  ? "Roll UOM Selected: 1 Roll × SPQ Meter = Total Meters | Total Meters ÷ SPQ Meter = Total Rolls"
                  : "Meter UOM Selected: Total Meters ÷ SPQ Meter = Total Rolls | Total Rolls × SPQ Meter = Total Meters"}
              </p>

              {isValidFactor ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-outline-variant bg-surface-white p-3">
                    <label htmlFor="calc-rolls" className="block font-label text-label font-bold text-on-surface">
                      Rolls (Count)
                    </label>
                    <input
                      id="calc-rolls"
                      type="number"
                      min="0"
                      step="any"
                      value={calcRolls}
                      onChange={(e) => handleRollsChange(e.target.value)}
                      className="mt-1 block w-full rounded border border-outline-variant/40 bg-surface-white px-3 py-1.5 font-mono text-mono-md font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    />
                    <p className="mt-1.5 font-body text-body-xs text-text-grey">
                      Calculation: <span className="font-mono">{calcRolls || "0"} Roll(s) × {factor}m = </span>
                      <strong className="font-mono text-on-surface">{(parseFloat(calcRolls || "0") * factor).toLocaleString()} Meters</strong>
                    </p>
                  </div>

                  <div className="rounded border border-outline-variant bg-surface-white p-3">
                    <label htmlFor="calc-meters" className="block font-label text-label font-bold text-on-surface">
                      Meters (Meterage)
                    </label>
                    <input
                      id="calc-meters"
                      type="number"
                      min="0"
                      step="any"
                      value={calcMeters || String(parseFloat(calcRolls || "1") * factor)}
                      onChange={(e) => handleMetersChange(e.target.value)}
                      className="mt-1 block w-full rounded border border-outline-variant/40 bg-surface-white px-3 py-1.5 font-mono text-mono-md font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    />
                    <p className="mt-1.5 font-body text-body-xs text-text-grey">
                      Calculation: <span className="font-mono">{calcMeters || String(factor)}m ÷ {factor}m = </span>
                      <strong className="font-mono text-on-surface">{factor > 0 ? (parseFloat(calcMeters || String(factor)) / factor).toFixed(4) : 0} Rolls</strong>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 font-body text-body-sm font-semibold text-status-pending">
                  Enter an SPQ Meter value (e.g. 750) above to enable live Roll ↔ Meter conversion preview (1 Roll × 750 = 750 Meters | 750 Meters / 750 = 1 Roll).
                </p>
              )}
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
              placeholder="e.g. 24"
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
              placeholder="e.g. 12.5"
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
              placeholder="e.g. 30"
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
              placeholder="e.g. 20"
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
              placeholder="e.g. 15"
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

      {/* Section: Pricing */}
      <section aria-labelledby="section-pricing" className="mt-8">
        <h2
          id="section-pricing"
          className="mb-4 font-heading font-semibold text-data-display text-on-surface"
        >
          Pricing
        </h2>
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
              Buying Price
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
              Selling Price
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
      {/* ── Category / Subcategory Quick Management Modal ── */}
      {categoryModal.mode !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-surface-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-heading text-base font-bold text-brand-navy">
                {categoryModal.mode === "add_category"
                  ? "Add New Category"
                  : categoryModal.mode === "edit_category"
                  ? "Edit Category"
                  : categoryModal.mode === "add_subcategory"
                  ? "Add New Subcategory"
                  : "Edit Subcategory"}
              </h3>
              <button
                type="button"
                onClick={() => setCategoryModal({ mode: null, name: "", flowType: "" })}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {categoryModal.error && (
                <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                  {categoryModal.error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  {categoryModal.mode.includes("subcategory") ? "Subcategory Name" : "Category Name"}{" "}
                  <span className="text-brand-red">*</span>
                </label>
                <input
                  type="text"
                  value={categoryModal.name}
                  onChange={(e) =>
                    setCategoryModal((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Electrical Components, Packaging Materials"
                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  autoFocus
                />
              </div>

              {!categoryModal.mode.includes("subcategory") && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Applicable Inventory Model
                  </label>
                  <select
                    value={categoryModal.flowType}
                    onChange={(e) =>
                      setCategoryModal((prev) => ({ ...prev, flowType: e.target.value }))
                    }
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    <option value="">All Models</option>
                    <option value="vmi">VMI</option>
                    <option value="trading">Trading</option>
                    <option value="supplies">Supplies</option>
                  </select>
                </div>
              )}

              {categoryModal.mode.includes("subcategory") && (
                <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 border border-slate-200">
                  Parent Category:{" "}
                  <strong className="text-brand-navy">
                    {localCategories.find((c) => c.id === parentCategoryId)?.name || "Selected Category"}
                  </strong>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2.5 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setCategoryModal({ mode: null, name: "", flowType: "" })}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={categoryModal.loading || !categoryModal.name.trim()}
                  onClick={async () => {
                    setCategoryModal((prev) => ({ ...prev, loading: true, error: null }));
                    const trimmedName = categoryModal.name.trim();

                    if (categoryModal.mode === "add_category" || categoryModal.mode === "add_subcategory") {
                      const res = await createCategoryAction({
                        name: trimmedName,
                        flowType: categoryModal.flowType || null,
                        parentId: categoryModal.mode === "add_subcategory" ? parentCategoryId : null,
                      });

                      if (res.ok && res.category) {
                        const newCat = res.category as CategoryOption;
                        setLocalCategories((prev) => [...prev, newCat]);
                        if (categoryModal.mode === "add_category") {
                          setParentCategoryId(newCat.id);
                          setSubcategoryId("");
                        } else {
                          setSubcategoryId(newCat.id);
                        }
                        setCategoryModal({ mode: null, name: "", flowType: "" });
                      } else {
                        setCategoryModal((prev) => ({ ...prev, loading: false, error: res.error || "Failed to create category" }));
                      }
                    } else if (categoryModal.mode === "edit_category" || categoryModal.mode === "edit_subcategory") {
                      if (!categoryModal.targetId) return;
                      const res = await updateCategoryAction({
                        id: categoryModal.targetId,
                        name: trimmedName,
                        flowType: categoryModal.flowType || null,
                      });

                      if (res.ok && res.category) {
                        const updatedCat = res.category as CategoryOption;
                        setLocalCategories((prev) =>
                          prev.map((c) => (c.id === updatedCat.id ? { ...c, ...updatedCat } : c))
                        );
                        setCategoryModal({ mode: null, name: "", flowType: "" });
                      } else {
                        setCategoryModal((prev) => ({ ...prev, loading: false, error: res.error || "Failed to update category" }));
                      }
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-4 py-2 text-xs font-bold text-surface-white hover:bg-brand-navy/90 transition-all disabled:opacity-50"
                >
                  {categoryModal.loading ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  {categoryModal.mode?.startsWith("add") ? "Create & Select" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
