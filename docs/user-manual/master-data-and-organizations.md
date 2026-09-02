# Dyna-Serv WIMS — User Manual & Operations Guide

## Chapter: Master Data Enrollment & Organization Management

---

### 1. Organization Enrollment & Role Auto-Assignment

Organizations represent all internal and external entities interacting with Dyna-Serv WIMS:

* **Customer**: Buys commercial goods under the **Trading** inventory model.
* **Vendor**: Consignor providing consignment stock under the **VMI** model.
* **Supplier**: Third-party supplier providing goods or raw inventory.
* **Internal Warehouse**: Dyna-Serv operational facilities managing **Supplies**.

#### Auto-Assigned Inventory Models:
When creating or editing an item, selecting an Organization automatically sets the default Inventory Model based on the organization's enrolled role:
* Organization with role `vendor` $\rightarrow$ Auto-assigned `VMI`
* Organization with role `customer` / `supplier` $\rightarrow$ Auto-assigned `Trading`
* Organization with role `internal_warehouse` $\rightarrow$ Auto-assigned `Supplies`

---

### 2. Item Master Enrollment

To enroll a new item code into the master catalog:

1. Navigate to **Master Data** $\rightarrow$ **Items** $\rightarrow$ **+ Enroll Item** (`/master-data/items/new`).
2. **Organization & Model**: Select the Owner Organization on the left; the Inventory Model on the right auto-configures.
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
