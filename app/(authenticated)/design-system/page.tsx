"use client";

import React, { useState } from "react";
import {
  Button,
  Badge,
  StatusBadge,
  InventoryModelBadge,
  RoleBadge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  SearchInput,
  Select,
  Textarea,
  Checkbox,
  Radio,
  Switch,
  Modal,
  ModalBody,
  ModalFooter,
  Alert,
  EmptyState,
  StatCard,
  Skeleton,
  SkeletonCard,
  SkeletonTable,
  SkeletonText,
  LoadingSpinner,
  Tabs,
  TabList,
  TabTrigger,
  TabContent,
  Tooltip,
  Heading,
  Text,
  Label,
  Code,
  DataDisplay,
} from "@/components/ui";
import {
  Sparkles,
  Package,
  Layers,
  ArrowRight,
  ShieldCheck,
  Search,
  Barcode,
  Truck,
  Plus,
  RefreshCw,
  Eye,
  Check,
  AlertOctagon,
  Boxes,
  Info,
} from "lucide-react";

export default function DesignSystemPage() {
  const [surfaceMode, setSurfaceMode] = useState<"office" | "floor">("office");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [inputValue, setInputValue] = useState("LOC-A-01-04");
  const [searchValue, setSearchValue] = useState("");
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [radioSelected, setRadioSelected] = useState("fifo");
  const [switchChecked, setSwitchChecked] = useState(true);

  const isFloor = surfaceMode === "floor";

  return (
    <div
      className={`min-h-screen transition-colors duration-200 p-4 sm:p-8 ${
        isFloor ? "bg-[#002060] text-white" : "bg-background text-text-primary"
      }`}
    >
      <div className="max-w-container mx-auto space-y-12">
        {/* Header with Surface Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-inherit/20">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-primary text-white shadow-sm">
                <Sparkles className="w-5 h-5" />
              </span>
              <h1 className="font-heading text-headline-lg font-bold tracking-tight">
                Design System & Component Library
              </h1>
            </div>
            <p className="font-body text-body-md opacity-80 mt-1">
              Unified design tokens, accessibility primitives, and dual-surface (Office / Floor) specifications.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-200/40 dark:bg-white/10 p-1.5 rounded-xl">
            <span className="text-xs font-bold uppercase tracking-wider px-2 opacity-70">
              Surface Preview:
            </span>
            <button
              type="button"
              onClick={() => setSurfaceMode("office")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !isFloor
                  ? "bg-white text-primary shadow-xs"
                  : "text-white/80 hover:text-white"
              }`}
            >
              Office (Light)
            </button>
            <button
              type="button"
              onClick={() => setSurfaceMode("floor")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                isFloor
                  ? "bg-primary text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Floor (Warehouse Dark)
            </button>
          </div>
        </div>

        {/* Section 1: Color Tokens & Palette */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-headline-md font-bold">1. Color Tokens & Palette</h2>
            <Badge variant="primary" size="sm">Brand Standards</Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { name: "Primary", hex: "#2563EB", bg: "bg-primary", text: "text-white", note: "Primary buttons, active controls" },
              { name: "Primary Hover", hex: "#1E3A8A", bg: "bg-[#1E3A8A]", text: "text-white", note: "Hover/pressed state" },
              { name: "Secondary", hex: "#7C3AED", bg: "bg-secondary", text: "text-white", note: "Accents, highlights" },
              { name: "Success", hex: "#10B981", bg: "bg-success", text: "text-white", note: "Available, approved" },
              { name: "Warning", hex: "#F59E0B", bg: "bg-warning", text: "text-slate-900", note: "Pending, staged" },
              { name: "Error / Held", hex: "#EF4444", bg: "bg-error", text: "text-white", note: "Held, rejected, fail" },
              { name: "Text Primary", hex: "#0F172A", bg: "bg-[#0F172A]", text: "text-white", note: "Headings, titles" },
              { name: "Text Secondary", hex: "#64748B", bg: "bg-[#64748B]", text: "text-white", note: "Descriptions, helpers" },
              { name: "Surface", hex: "#FFFFFF", bg: "bg-white", text: "text-slate-900", border: true, note: "Cards, modals, tables" },
              { name: "Background", hex: "#F3F6FC", bg: "bg-[#F3F6FC]", text: "text-slate-900", border: true, note: "Office canvas" },
              { name: "Floor Navy", hex: "#002060", bg: "bg-[#002060]", text: "text-white", note: "Warehouse dark canvas" },
              { name: "Border", hex: "#E2E8F0", bg: "bg-[#E2E8F0]", text: "text-slate-900", note: "Dividers, outlines" },
            ].map((color) => (
              <div
                key={color.name}
                className={`p-3.5 rounded-xl flex flex-col justify-between border ${
                  color.border ? "border-slate-300" : "border-transparent"
                } ${color.bg} ${color.text} shadow-xs`}
              >
                <div>
                  <div className="font-heading font-bold text-sm">{color.name}</div>
                  <div className="font-mono text-xs opacity-90">{color.hex}</div>
                </div>
                <div className="text-[11px] opacity-75 mt-3 leading-tight font-body">
                  {color.note}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Typography & Font Size System */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-headline-md font-bold">2. Typography & Font Size Scale</h2>
              <Badge variant="primary" size="sm">Etna + Glacial</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isFloor ? "warning" : "neutral"} size="sm">
                {isFloor ? "Floor Rule: Min 16px Text" : "Office: Full Type Scale"}
              </Badge>
            </div>
          </div>

          <Card surface={surfaceMode} padding="md" className="space-y-8">
            {/* Headings Scale H1-H6 */}
            <div>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-inherit/10">
                <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70">
                  Headings Hierarchy (Etna Sans Serif)
                </h3>
                <span className="text-xs font-mono opacity-60">Font-weight: 700 / 600</span>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 p-3 rounded-xl bg-inherit/5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      H1 · Headline-XL (40px / 48px · Bold)
                    </span>
                    <Heading as="h1" surface={surfaceMode}>
                      Hero Page Title & Master Display
                    </Heading>
                  </div>
                  <Badge variant="neutral" size="sm" className="shrink-0">Office Hero</Badge>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 p-3 rounded-xl bg-inherit/5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      H2 · Headline-LG (32px / 40px · Bold)
                    </span>
                    <Heading as="h2" surface={surfaceMode}>
                      Section Header & Primary Screen Title
                    </Heading>
                  </div>
                  <Badge variant="neutral" size="sm" className="shrink-0">Floor Max / Office</Badge>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 p-3 rounded-xl bg-inherit/5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      H3 · Headline-MD (24px / 32px · SemiBold)
                    </span>
                    <Heading as="h3" surface={surfaceMode}>
                      Card Title, Panel Header & Modal Heading
                    </Heading>
                  </div>
                  <Badge variant="neutral" size="sm" className="shrink-0">All Surfaces</Badge>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 p-3 rounded-xl bg-inherit/5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      H4 · Group Title (20px / 28px · SemiBold)
                    </span>
                    <Heading as="h4" surface={surfaceMode}>
                      Sub-section Header & Field Group Title
                    </Heading>
                  </div>
                  <Badge variant="neutral" size="sm" className="shrink-0">All Surfaces</Badge>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 p-3 rounded-xl bg-inherit/5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      H5 · Tile Title (18px / 24px · SemiBold)
                    </span>
                    <Heading as="h5" surface={surfaceMode}>
                      Item Header & List Section Title
                    </Heading>
                  </div>
                  <Badge variant="neutral" size="sm" className="shrink-0">All Surfaces</Badge>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 p-3 rounded-xl bg-inherit/5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                      H6 · Micro Heading (16px / 20px · SemiBold)
                    </span>
                    <Heading as="h6" surface={surfaceMode}>
                      Compact Header & Micro Navigation Title
                    </Heading>
                  </div>
                  <Badge variant="neutral" size="sm" className="shrink-0">Floor Minimum Heading</Badge>
                </div>
              </div>
            </div>

            {/* Body Copy & Data Scale */}
            <div>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-inherit/10">
                <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70">
                  Body, Labels & High-Legibility Data Displays (Glacial Indifference)
                </h3>
                <span className="text-xs font-mono opacity-60">Regular 400 / Bold 700</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-inherit/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-primary">body-lg (18px / 28px)</span>
                    <Badge size="sm" variant="neutral">Lead text</Badge>
                  </div>
                  <Text size="lg" surface={surfaceMode}>
                    Warehouse inbound staging area operates on strict FIFO sequence allocation.
                  </Text>
                </div>

                <div className="p-4 rounded-xl border border-inherit/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-success">body-md (16px / 24px)</span>
                    <Badge size="sm" variant="success">Floor Minimum (AAA)</Badge>
                  </div>
                  <Text size="md" surface={surfaceMode}>
                    Standard operational body text used in receiving scan loops, table rows, and dialogues.
                  </Text>
                </div>

                <div className="p-4 rounded-xl border border-inherit/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-warning">body-sm (14px / 20px)</span>
                    <Badge size="sm" variant="warning">Office Only</Badge>
                  </div>
                  <Text size="sm" surface={surfaceMode}>
                    Secondary helper text and metadata descriptions for dense desktop office views.
                  </Text>
                </div>

                <div className="p-4 rounded-xl border border-inherit/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-500">text-xs (12px / 16px)</span>
                    <Badge size="sm" variant="neutral">Office Timestamps</Badge>
                  </div>
                  <Text size="xs" surface={surfaceMode} variant="secondary">
                    Logged by System Supervisor · 2026-09-06 14:50 PHT · Audit Ref #9842
                  </Text>
                </div>
              </div>
            </div>

            {/* Codes, Barcodes & KPI Displays */}
            <div>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-inherit/10">
                <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70">
                  Barcode / Bin Codes & Data Numbers
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-inherit/10 space-y-2">
                  <Label surface={surfaceMode}>Location Identifier</Label>
                  <Code size="lg" surface={surfaceMode}>LOC-BAY-02-RACK-04</Code>
                </div>

                <div className="p-4 rounded-xl border border-inherit/10 space-y-2">
                  <Label surface={surfaceMode}>Lot Number (Glacial Bold)</Label>
                  <Code size="lg" surface={surfaceMode}>LOT-2026-0819-A</Code>
                </div>

                <div className="p-4 rounded-xl border border-inherit/10 space-y-1">
                  <DataDisplay
                    surface={surfaceMode}
                    label="Current Available Stock"
                    value="48,250"
                    unit="Units"
                    size="md"
                  />
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Section 3: Buttons & Actions */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-headline-md font-bold">3. Buttons & Touch Targets</h2>
              <Badge variant="neutral" size="sm">WCAG AA / AAA</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${buttonLoading ? "animate-spin" : ""}`} />}
              onClick={() => {
                setButtonLoading(true);
                setTimeout(() => setButtonLoading(false), 2000);
              }}
            >
              Toggle Loading State
            </Button>
          </div>

          <Card surface={surfaceMode} padding="md" className="space-y-6">
            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70 mb-3">
                Office Variants (44px standard)
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" isLoading={buttonLoading} leftIcon={<Plus className="w-4 h-4" />}>
                  Primary Button
                </Button>
                <Button variant="secondary" isLoading={buttonLoading} leftIcon={<Eye className="w-4 h-4" />}>
                  Secondary
                </Button>
                <Button variant="outline" isLoading={buttonLoading}>
                  Outline
                </Button>
                <Button variant="destructive" isLoading={buttonLoading} leftIcon={<AlertOctagon className="w-4 h-4" />}>
                  Destructive
                </Button>
                <Button variant="ghost" isLoading={buttonLoading}>
                  Ghost
                </Button>
                <Button variant="link">Link Style</Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
              </div>
            </div>

            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70 mb-3">
                Sizes Scale
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="primary">Small (32px)</Button>
                <Button size="md" variant="primary">Medium (40px)</Button>
                <Button size="lg" variant="primary">Large (48px)</Button>
                <Tooltip content="Floor 64px thumb-zone CTA">
                  <Button size="floor" variant="primary" leftIcon={<Barcode className="w-6 h-6" />}>
                    Floor Action (64px)
                  </Button>
                </Tooltip>
              </div>
            </div>

            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70 mb-3">
                Floor High-Contrast Dedicated CTAs (64px Height, Bottom Thumb-Zone)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button variant="floor-primary" leftIcon={<Barcode className="w-6 h-6" />}>
                  Scan Barcode
                </Button>
                <Button variant="floor-success" leftIcon={<Check className="w-6 h-6" />}>
                  Confirm Pass
                </Button>
                <Button variant="floor-danger" leftIcon={<AlertOctagon className="w-6 h-6" />}>
                  Reject Lot
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* Section 3: Badges & Status Signals */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-headline-md font-bold">3. Badges, Statuses & Models</h2>
            <Badge variant="secondary" size="sm">Pill Radius-Full</Badge>
          </div>

          <Card surface={surfaceMode} padding="md" className="space-y-6">
            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70 mb-3">
                Semantic Status Badges (Never color alone — always includes Icon)
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge status="available" />
                <StatusBadge status="passed" />
                <StatusBadge status="approved" />
                <StatusBadge status="pending" />
                <StatusBadge status="in_transit" />
                <StatusBadge status="under_inspection" />
                <StatusBadge status="held" />
                <StatusBadge status="rejected" />
                <StatusBadge status="depleted" />
                <StatusBadge status="archived" />
              </div>
            </div>

            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70 mb-3">
                Inventory Models
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <InventoryModelBadge model="vmi" />
                <InventoryModelBadge model="trading" />
                <InventoryModelBadge model="customer_owned" />
              </div>
            </div>

            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider opacity-70 mb-3">
                User Roles
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <RoleBadge role="administrator" />
                <RoleBadge role="supervisor" />
                <RoleBadge role="warehouse_staff" />
                <RoleBadge role="organization_user" />
              </div>
            </div>
          </Card>
        </section>

        {/* Section 4: Form Controls & Inputs */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-headline-md font-bold">4. Form Controls & Scanner Inputs</h2>
            <Badge variant="primary" size="sm">Accessible</Badge>
          </div>

          <Card surface={surfaceMode} padding="md" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                surface={surfaceMode}
                label="Location Code"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                leftIcon={<Barcode className="w-4 h-4" />}
                clearable
                onClear={() => setInputValue("")}
                helperText="Scan or enter warehouse bin ID"
              />

              <Input
                surface={surfaceMode}
                label="Quantity Required"
                defaultValue="250"
                type="number"
                error="Quantity exceeds current available lot balance (200)"
              />

              <Select
                surface={surfaceMode}
                label="Destination Bay"
                defaultValue="bay_1"
                options={[
                  { value: "bay_1", label: "Bay 1 (Receiving Staging)" },
                  { value: "bay_2", label: "Bay 2 (Bulk Racks)" },
                  { value: "bay_3", label: "Bay 3 (Quarantine / Hold)" },
                ]}
                helperText="Select storage destination zone"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchInput
                surface={surfaceMode}
                placeholder="Search items, lot numbers, barcodes, suppliers..."
                shortcutHint="Ctrl+K"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onSearch={(val) => console.log("Searching:", val)}
              />

              <Textarea
                surface={surfaceMode}
                label="Discrepancy / Inspection Notes"
                placeholder="Describe reason for lot hold or damage observation..."
                maxLength={200}
                showCount
                helperText="Notes are logged to permanent audit trail"
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-8">
              <Checkbox
                surface={surfaceMode}
                label="Require Supervisor Sign-off"
                description="Overrides standard FIFO queue for immediate release"
                checked={checkboxChecked}
                onChange={(e) => setCheckboxChecked(e.target.checked)}
              />

              <div className="flex items-center gap-4">
                <Radio
                  surface={surfaceMode}
                  name="allocation"
                  label="FIFO Auto"
                  checked={radioSelected === "fifo"}
                  onChange={() => setRadioSelected("fifo")}
                />
                <Radio
                  surface={surfaceMode}
                  name="allocation"
                  label="FEFO Expiration"
                  checked={radioSelected === "fefo"}
                  onChange={() => setRadioSelected("fefo")}
                />
              </div>

              <Switch
                label="Audio Scan Beeper"
                description="Chime on successful camera/hardware scan"
                checked={switchChecked}
                onChange={(e) => setSwitchChecked(e.target.checked)}
              />
            </div>
          </Card>
        </section>

        {/* Section 5: Standardized 3-Component Error & Feedback Banners */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-headline-md font-bold">5. 3-Component Feedback Banners</h2>
            <Badge variant="error" size="sm">Rule: What / Why / Next Action</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Alert
              surface={surfaceMode}
              variant="error"
              title="Barcode Mismatch Detected"
              description="Scanned barcode 'ITEM-9981' does not belong to active Pick List #PL-2026-0819."
              actionLabel="Rescan Correct Item"
              onAction={() => alert("Ready to rescan item")}
            />

            <Alert
              surface={surfaceMode}
              variant="warning"
              title="FIFO Sequence Alert"
              description="Older lot 'LOT-2026-01-A' is available in Location R-02. Current pick uses newer stock."
              actionLabel="Request FIFO Override"
              onAction={() => alert("Override request initiated")}
            />

            <Alert
              surface={surfaceMode}
              variant="success"
              title="Putaway Commitment Confirmed"
              description="150 units successfully committed to Location LOC-B-04-12 on server."
              actionLabel="View Updated Ledger"
              onAction={() => alert("Navigating to ledger")}
            />

            <Alert
              surface={surfaceMode}
              variant="info"
              title="Scheduled Maintenance Notice"
              description="Daily inventory sync and snapshot generation runs at 23:00 PHT."
              actionLabel="View System Status"
              onAction={() => alert("Opening status")}
            />
          </div>
        </section>

        {/* Section 6: Stat / KPI Cards & Skeletons */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-headline-md font-bold">6. KPI Stat Cards & Loading States</h2>
            <Badge variant="primary" size="sm">Bento Grid</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              surface={surfaceMode}
              title="Today's Receipts"
              value="1,420 Units"
              subtitle="12 pending putaway"
              icon={<Package className="w-5 h-5" />}
              change={{ value: "+18.2%", trend: "up" }}
              variant="primary"
            />
            <StatCard
              surface={surfaceMode}
              title="Active Pick Lists"
              value="8 Open"
              subtitle="4 staged for dispatch"
              icon={<Boxes className="w-5 h-5" />}
              change={{ value: "-4.5%", trend: "down" }}
              variant="warning"
            />
            <StatCard
              surface={surfaceMode}
              title="Warehouse Conformance"
              value="99.4%"
              subtitle="0 safety incidents"
              icon={<ShieldCheck className="w-5 h-5" />}
              change={{ value: "Target met", trend: "neutral" }}
              variant="success"
            />
            <StatCard
              surface={surfaceMode}
              title="Dispatched (MTD)"
              value="24,850 CBM"
              subtitle="18 carriers processed"
              icon={<Truck className="w-5 h-5" />}
              change={{ value: "+8.9%", trend: "up" }}
              variant="secondary"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <SkeletonCard surface={surfaceMode} />
            <div className="md:col-span-2">
              <SkeletonTable surface={surfaceMode} rows={3} cols={4} />
            </div>
          </div>
        </section>

        {/* Section 7: Tabs, Modals & Empty States */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-headline-md font-bold">7. Interactive Overlays & Tabs</h2>
              <Badge variant="neutral" size="sm">Level 2 Surface</Badge>
            </div>
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              Launch Example Modal
            </Button>
          </div>

          <Card surface={surfaceMode} padding="md">
            <Tabs defaultValue="overview">
              <TabList>
                <TabTrigger value="overview" icon={<Package className="w-4 h-4" />}>
                  Overview
                </TabTrigger>
                <TabTrigger value="history" icon={<Truck className="w-4 h-4" />} badge={<Badge size="sm" variant="primary">24</Badge>}>
                  Movement History
                </TabTrigger>
                <TabTrigger value="audit" icon={<ShieldCheck className="w-4 h-4" />}>
                  Audit Log
                </TabTrigger>
              </TabList>

              <TabContent value="overview">
                <EmptyState
                  surface={surfaceMode}
                  title="No Pending Discrepancies"
                  description="All receiving lines, lot allocations, and location balances match physical inventory."
                  action={{
                    label: "Start New Receiving Batch",
                    onClick: () => alert("Starting receiving"),
                    leftIcon: <Plus className="w-4 h-4" />,
                  }}
                  secondaryAction={{
                    label: "View Receiving Ledger",
                    onClick: () => alert("Viewing ledger"),
                  }}
                />
              </TabContent>

              <TabContent value="history">
                <div className="p-4 text-sm opacity-80">
                  Transaction movement log data will display here.
                </div>
              </TabContent>

              <TabContent value="audit">
                <div className="p-4 text-sm opacity-80">
                  Immutable audit trail and change events.
                </div>
              </TabContent>
            </Tabs>
          </Card>
        </section>

        {/* Interactive Modal Demo */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Resolve FIFO Allocation Override"
          description="Supervisor sign-off required to dispatch non-sequential inventory lot."
          size="md"
        >
          <ModalBody className="space-y-4">
            <Alert
              variant="warning"
              title="Manual Allocation Override"
              description="You are bypassing the recommended FIFO sequence for Organization 'Dyna-Serv Trading'."
            />
            <Input
              label="Supervisor Passcode / Reason"
              placeholder="Enter authorization justification..."
              required
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                alert("Override approved!");
                setIsModalOpen(false);
              }}
            >
              Authorize Override
            </Button>
          </ModalFooter>
        </Modal>
      </div>
    </div>
  );
}
