# Dyna-Serv WIMS — Master Data & Organizations Companion Guide

**Canonical manual:** [Unified User Manual](../USER_MANUAL.md)  
**Status:** Companion chapter; reconcile with the unified manual whenever workflow rules change.  
**Last reconciled:** 2026-10-27

## Chapter: Master Data Enrollment & Organization Management

---

### 1. Organization Enrollment & Role Auto-Assignment

Organizations represent all internal and external entities interacting with Dyna-Serv WIMS:

* **Customer**: Buys commercial goods under the **Trading** inventory model.
* **VMI customer**: Organization whose stock is held under the **VMI** model.
* **Supplier**: Third-party supplier providing goods or raw inventory.
* **Internal Warehouse**: Dyna-Serv operational facilities managing **Supplies**.

#### Auto-Assigned Inventory Models:
When creating or editing an item, selecting an Organization automatically sets the default Inventory Model based on the organization's enrolled role:
* Organization with role `vmi_customer` $\rightarrow$ Auto-assigned `VMI`
* Organization with role `supplier` $\rightarrow$ Auto-assigned `Trading`
* Organization with role `internal_warehouse` $\rightarrow$ Auto-assigned `Supplies`

---

### 2. Item Master Enrollment

To enroll a new item code into the master catalog:

1. Navigate to **Master Data** $\rightarrow$ **Items** $\rightarrow$ **+ Enroll Item** (`/master-data/items/new`).
2. **Organization & Model**: Select the material-origin organization on the left. In material enrollment, the selector is intentionally limited to organizations with `supplier` or `vmi_customer` roles; the inventory model on the right is inherited from that organization.
3. **Item Identifiers**: Enter Dyna-Serv Item Code, Item Name, and optional Customer Item Code.
4. **Category & Subcategory Hierarchy**:
   * Select from existing categories/subcategories.
   * **On-the-Fly Creation & Editing**: Click **+ Add Category** or the **Pencil icon** to create or rename categories and subcategories directly within the form without navigating away.
5. **Pack Units & SPQ**:
   * **UOM**: Enrolled Unit of Measure (`PCS`, `ROLL`, `KG`, `METER`, etc.).
   * **SPQ**: Standard Pack Quantity per box (e.g. `100`).
6. **Financial Pricing**:
   * Enter Unit Buying Price and Unit Selling Price (calculates Box Price and Gross Margin percentage automatically).
7. Click **Save Item Master**.
