"use client";

import { useState } from "react";
import {
  Warehouse,
  Camera,
  Vibrate,
  Volume2,
  BellRing,
  CheckCircle2,
  AlertCircle,
  Save,
  Barcode,
  Play,
  Clock,
  Sparkles,
  Sliders,
  Printer,
  Layout,
  FileText,
  Upload,
  RotateCcw,
  Trash2,
  AlignLeft,
  AlignCenter,
} from "lucide-react";
import type { GeneralSettingsData } from "@/app/(authenticated)/settings/general/actions";
import { saveGeneralSettings } from "@/app/(authenticated)/settings/general/actions";
import { PhoneInputField } from "@/components/global/PhoneInputField";
import { MasterDocumentHeader } from "@/components/print/MasterDocumentHeader";
import { MasterDocumentFooter } from "@/components/print/MasterDocumentFooter";
import { DEFAULT_DOCUMENT_TEMPLATE } from "@/lib/documents/document-template";

export function GeneralSettingsForm({ initialSettings }: { initialSettings: GeneralSettingsData }) {
  const [settings, setSettings] = useState<GeneralSettingsData>(() => ({
    ...initialSettings,
    printTemplate: {
      ...DEFAULT_DOCUMENT_TEMPLATE,
      ...(initialSettings.printTemplate ?? {}),
      facilityAddress:
        initialSettings.printTemplate?.facilityAddress ?? initialSettings.facility.physicalAddress,
      contactInfo:
        initialSettings.printTemplate?.contactInfo ??
        `Tel: ${initialSettings.facility.contactPhone} | Email: ${initialSettings.facility.contactEmail}`,
      companyName:
        initialSettings.printTemplate?.companyName === "DYNA-SERV GLOBAL CORPORATION"
          ? DEFAULT_DOCUMENT_TEMPLATE.companyName
          : initialSettings.printTemplate?.companyName ?? DEFAULT_DOCUMENT_TEMPLATE.companyName,
    },
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [hapticTested, setHapticTested] = useState(false);
  const [audioTested, setAudioTested] = useState(false);

  // Handle Logo Upload via browser FileReader
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo image size must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      if (result) {
        setSettings((prev) => ({
          ...prev,
          printTemplate: {
            ...prev.printTemplate,
            logoUrl: result,
          },
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Web Audio Synthesizer for Floor Alerts test
  function testAudioAlertTone() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      // Dual tone alert pattern (800Hz -> 400Hz quarantine tone)
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);

      setAudioTested(true);
      setTimeout(() => setAudioTested(false), 2000);
    } catch {
      // Audio not supported in environment
    }
  }

  // Web Vibration API test for mobile browser haptics
  function testHapticPulse() {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
    setHapticTested(true);
    setTimeout(() => setHapticTested(false), 2000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setStatus(null);

    const res = await saveGeneralSettings(settings);
    setIsSaving(false);
    if (res.ok) {
      setStatus({ type: "success", message: "General warehouse and BYOD scanner settings saved successfully." });
    } else {
      setStatus({ type: "error", message: res.error || "Failed to save settings." });
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-8 max-w-4xl">
      {/* ── Section 1: Facility & Company Identity ─────────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
            <Warehouse className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold text-slate-900">Company &amp; Warehouse Facility Identity</h2>
            <p className="font-body text-xs text-slate-500">
              Registered corporate identity, physical warehouse facility address, and localized operational defaults.
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Registered Company Name
            </label>
            <input
              type="text"
              value={settings.facility.companyName}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, companyName: e.target.value },
                })
              }
              placeholder="e.g. Dyna-Serv Logistics Philippines Inc."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            />
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Warehouse Facility Name
            </label>
            <input
              type="text"
              value={settings.facility.facilityName}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, facilityName: e.target.value },
                })
              }
              placeholder="e.g. Main Logistics & Distribution Warehouse Hub"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Physical Warehouse Address (Street, Barangay, City, Province, Postal Code)
            </label>
            <input
              type="text"
              value={settings.facility.physicalAddress}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, physicalAddress: e.target.value },
                })
              }
              placeholder="e.g. Lot 14 Block 3, Laguna Technopark Special Economic Zone, Biñan, Laguna 4024, Philippines"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            />
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Operational Contact Phone
            </label>
            <PhoneInputField
              value={settings.facility.contactPhone}
              onChange={(val) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, contactPhone: val },
                })
              }
              placeholder="e.g. 49 541 2345"
            />
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Official Operational Email
            </label>
            <input
              type="email"
              value={settings.facility.contactEmail}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, contactEmail: e.target.value },
                })
              }
              placeholder="warehouse.ops@dyna-serv.com"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            />
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Company Tax ID / TIN (Document Header)
            </label>
            <input
              type="text"
              value={settings.facility.tinNumber}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, tinNumber: e.target.value },
                })
              }
              placeholder="000-123-456-000"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            />
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Default Floor Intake Zone
            </label>
            <select
              value={settings.facility.defaultZone}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, defaultZone: e.target.value },
                })
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            >
              <option value="Zone A — Intake & Staging">Zone A — Intake &amp; Staging</option>
              <option value="Zone B — High-Density Pallet Racks">Zone B — High-Density Pallet Racks</option>
              <option value="Zone C — Outbound Staging & Dispatch">Zone C — Outbound Staging &amp; Dispatch</option>
            </select>
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Operational Timezone
            </label>
            <select
              value={settings.facility.timezone}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, timezone: e.target.value },
                })
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            >
              <option value="Asia/Manila (GMT+8)">Asia/Manila (PHT, GMT+8)</option>
              <option value="UTC">Coordinated Universal Time (UTC)</option>
              <option value="Asia/Tokyo (GMT+9)">Asia/Tokyo (JST, GMT+9)</option>
            </select>
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Shift Clock &amp; Date Formatting
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={settings.facility.timeClockFormat}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    facility: {
                      ...settings.facility,
                      timeClockFormat: e.target.value as "12h" | "24h",
                    },
                  })
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
              >
                <option value="12h">12-Hour (AM/PM)</option>
                <option value="24h">24-Hour (Military)</option>
              </select>
              <select
                value={settings.facility.dateFormat}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    facility: { ...settings.facility, dateFormat: e.target.value },
                  })
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: BYOD Mobile Camera & Scanner Engine ────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-royal-blue text-white shadow-xs">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold text-slate-900">
              BYOD Mobile Camera &amp; Scanner Configuration
            </h2>
            <p className="font-body text-xs text-slate-500">
              HTML5 native camera decoder engine, supported 1D/2D symbologies, and audio/haptic feedback.
            </p>
          </div>
        </div>

        {/* Engine Features */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-[#F8FAFC] cursor-pointer hover:bg-slate-50 transition-colors">
            <span className="font-heading text-xs font-bold text-slate-800">Continuous Stream</span>
            <input
              type="checkbox"
              checked={settings.scanner.continuousStream}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  scanner: { ...settings.scanner, continuousStream: e.target.checked },
                })
              }
              className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-[#F8FAFC] cursor-pointer hover:bg-slate-50 transition-colors">
            <span className="font-heading text-xs font-bold text-slate-800">Torch / Flashlight by Default</span>
            <input
              type="checkbox"
              checked={settings.scanner.torchDefault}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  scanner: { ...settings.scanner, torchDefault: e.target.checked },
                })
              }
              className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-[#F8FAFC] cursor-pointer hover:bg-slate-50 transition-colors">
            <span className="font-heading text-xs font-bold text-slate-800">Tap-to-Focus Target</span>
            <input
              type="checkbox"
              checked={settings.scanner.tapToFocus}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  scanner: { ...settings.scanner, tapToFocus: e.target.checked },
                })
              }
              className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
            />
          </label>
        </div>

        {/* Barcode Symbology Toggles */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2.5 font-label">
            Active Barcode Symbology Decoders
          </span>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { id: "code128", label: "Code 128 (Pallet & WRR)" },
              { id: "qrCode", label: "QR Code (Location & Shift)" },
              { id: "dataMatrix", label: "DataMatrix (Electronics)" },
              { id: "gs1128", label: "GS1-128 (CIPL & Outer Box)" },
            ].map((sym) => (
              <label
                key={sym.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-2xs cursor-pointer hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <Barcode className="h-4 w-4 text-slate-500" />
                  <span className="font-body text-xs font-semibold text-slate-800">{sym.label}</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.scanner.symbologies[sym.id as keyof typeof settings.scanner.symbologies]}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      scanner: {
                        ...settings.scanner,
                        symbologies: {
                          ...settings.scanner.symbologies,
                          [sym.id]: e.target.checked,
                        },
                      },
                    })
                  }
                  className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Audio & Haptic Browser Feedback with Live Test Triggers */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2.5 font-label">
            Mobile Browser Sensory Feedback
          </span>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-[#F8FAFC]">
              <div className="flex items-start gap-3">
                <Vibrate className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-heading text-xs font-bold text-slate-900 block">
                    Web Vibration API (Haptics)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tactile confirmation buzz upon valid barcode scan match.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={testHapticPulse}
                className={`ml-3 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-label text-xs font-bold transition-colors ${
                  hapticTested ? "bg-emerald-600 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 shadow-2xs"
                }`}
              >
                <Play className="h-3 w-3" />
                {hapticTested ? "Pulsed!" : "Test Haptic"}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-[#F8FAFC]">
              <div className="flex items-start gap-3">
                <Volume2 className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-heading text-xs font-bold text-slate-900 block">
                    Web Audio Alert Synthesizer
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Audible dual-tone beep on invalid, quarantined, or mismatch lot.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={testAudioAlertTone}
                className={`ml-3 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-label text-xs font-bold transition-colors ${
                  audioTested ? "bg-rose-600 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 shadow-2xs"
                }`}
              >
                <Play className="h-3 w-3" />
                {audioTested ? "Playing..." : "Play Tone"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Notification & Floor Alerts ─────────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold text-slate-900">
              Notification &amp; Floor Alerts
            </h2>
            <p className="font-body text-xs text-slate-500">
              Configure low-stock thresholds, quarantine in-app alerts, and optional low-stock email delivery. Item-level reorder levels remain authoritative when present.
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Low-Stock Unit Threshold (Pieces)
            </label>
            <input
              type="number"
              min="1"
              value={settings.alerts.lowStockThresholdUnits}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  alerts: {
                    ...settings.alerts,
                    lowStockThresholdUnits: parseInt(e.target.value, 10) || 0,
                  },
                })
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Low-Stock Capacity Threshold (CBM)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={settings.alerts.lowStockThresholdCbm}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  alerts: {
                    ...settings.alerts,
                    lowStockThresholdCbm: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
          </div>

          <div className="sm:col-span-2 space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.alerts.emailAlertsEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    alerts: { ...settings.alerts, emailAlertsEnabled: e.target.checked },
                  })
                }
                className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
              />
              <span className="font-body text-xs font-semibold text-slate-800">
                Send low-stock email alerts when a new in-app alert is created
              </span>
            </label>

            <div>
              <label className="block font-label text-xs font-bold text-slate-700 mb-1" htmlFor="settings-subscription-email">
                Low-Stock Alert Email
              </label>
              <input
                id="settings-subscription-email"
                type="email"
                value={settings.alerts.subscriptionEmail}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    alerts: { ...settings.alerts, subscriptionEmail: e.target.value },
                  })
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.alerts.qcQuarantineAlerts}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    alerts: {
                      ...settings.alerts,
                      qcQuarantineAlerts: e.target.checked,
                    },
                  })
                }
                className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
              />
              <span className="font-body text-xs font-semibold text-slate-800">
                Dispatch instant alerts to Shift Supervisors when a lot is placed on QC Quarantine Hold
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-not-allowed opacity-60">
              <input
                type="checkbox"
                checked={settings.alerts.dailyPdfReportSubscription}
                disabled
                readOnly
                className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
              />
              <span className="font-body text-xs font-semibold text-slate-800">
                Daily automated Master Inventory &amp; Valuation PDF report delivery (scheduler not configured)
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* ── Section 4: Master Printable Document Template & Layout Preview ─────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-slate-900">
                Master Document Print Template &amp; Orientation
              </h2>
              <p className="font-body text-xs text-slate-500">
                Standardized master corporate header adopted across all warehouse printable slips, WRR, Pick Lists, and Statement of Accounts.
              </p>
            </div>
          </div>

          {/* Orientation Toggle: Portrait vs Landscape */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    previewOrientation: "portrait",
                  },
                })
              }
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                settings.printTemplate.previewOrientation === "portrait"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Layout size={13} className="rotate-90" />
              <span>Portrait Preview</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    previewOrientation: "landscape",
                  },
                })
              }
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                settings.printTemplate.previewOrientation === "landscape"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Layout size={13} />
              <span>Landscape Preview</span>
            </button>
          </div>
        </div>

        {/* Brand Logo Upload & Management */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800">
                Official Corporate Brand Logo
              </h3>
              <p className="font-body text-xs text-slate-500">
                Upload your company or warehouse logo. Displayed on official printable documents (WRR, Pick Lists, SOAs).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-navy px-3 font-label text-xs font-bold text-white shadow-xs cursor-pointer hover:bg-brand-navy/90 transition-all">
                <Upload size={13} />
                <span>Upload Logo Image</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              {settings.printTemplate.logoUrl && settings.printTemplate.logoUrl !== "/logo-hd.png" && (
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      printTemplate: {
                        ...settings.printTemplate,
                        logoUrl: "/logo-hd.png",
                      },
                    })
                  }
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 font-label text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <RotateCcw size={12} />
                  <span>Reset Default</span>
                </button>
              )}
              {settings.printTemplate.logoUrl && (
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      printTemplate: {
                        ...settings.printTemplate,
                        logoUrl: "",
                      },
                    })
                  }
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 font-label text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={12} />
                  <span>Text Only</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <div className="flex h-12 w-28 items-center justify-center rounded-lg border border-slate-300 bg-white p-1 shadow-2xs shrink-0">
              {settings.printTemplate.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={settings.printTemplate.logoUrl}
                  alt="Logo Preview"
                  className="h-full w-auto max-h-10 max-w-full object-contain"
                />
              ) : (
                <span className="font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  No Logo
                </span>
              )}
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={settings.printTemplate.logoUrl ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    printTemplate: {
                      ...settings.printTemplate,
                      logoUrl: e.target.value,
                    },
                  })
                }
                placeholder="Or specify image URL / path (e.g. /logo-hd.png)"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-800 outline-none focus:border-brand-navy"
              />
            </div>
          </div>
        </div>

        {/* Configuration Fields */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
              Corporate Header Title
            </label>
            <input
              type="text"
              value={settings.printTemplate.companyName}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    companyName: e.target.value,
                  },
                })
              }
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm font-semibold text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
          </div>

          <div>
            <label className="block font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
              System Subtitle / Operations Department
            </label>
            <input
              type="text"
              value={settings.printTemplate.subtitle}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    subtitle: e.target.value,
                  },
                })
              }
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
              Facility Physical Address (Print Header)
            </label>
            <input
              type="text"
              value={settings.printTemplate.facilityAddress}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    facilityAddress: e.target.value,
                  },
                })
              }
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
          </div>

          <div>
            <label className="block font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
              Official Contact Numbers &amp; Email
            </label>
            <input
              type="text"
              value={settings.printTemplate.contactInfo}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    contactInfo: e.target.value,
                  },
                })
              }
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
          </div>

          <div>
            <label className="block font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
              PEZA Registration &amp; Tax ID / TIN (Optional)
            </label>
            <input
              type="text"
              value={settings.printTemplate.taxOrPezaReg ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    taxOrPezaReg: e.target.value,
                  },
                })
              }
              placeholder="e.g. PEZA Reg. 01-1234 | TIN 008-765-432 (Leave blank if not needed)"
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Only needed for customs/billing documents crossing ecozone boundaries.
            </p>
          </div>

          <div>
            <label className="block font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
              ISO Accreditation (Optional)
            </label>
            <input
              type="text"
              value={settings.printTemplate.isoAccreditation ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    isoAccreditation: e.target.value,
                  },
                })
              }
              placeholder="e.g. ISO 9001:2015 Certified (Leave blank to omit from header)"
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Safe to leave empty for a clean, minimal header.
            </p>
          </div>

          {/* Header Layout & Text Alignment Controls */}
          <div className="sm:col-span-2 pt-2 border-t border-slate-100 space-y-3">
            <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
              Header Layout &amp; Text Position Alignment
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block font-heading text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Corporate Header Position
                </label>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        printTemplate: {
                          ...settings.printTemplate,
                          headerAlignment: "left",
                        },
                      })
                    }
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                      (settings.printTemplate.headerAlignment ?? "left") === "left"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <AlignLeft size={13} />
                    <span>Left-Aligned (Split)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        printTemplate: {
                          ...settings.printTemplate,
                          headerAlignment: "center",
                        },
                      })
                    }
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                      settings.printTemplate.headerAlignment === "center"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <AlignCenter size={13} />
                    <span>Centered (Letterhead)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-heading text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Document Title Position
                </label>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        printTemplate: {
                          ...settings.printTemplate,
                          titleAlignment: "left",
                        },
                      })
                    }
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                      (settings.printTemplate.titleAlignment ?? "left") === "left"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <AlignLeft size={13} />
                    <span>Left-Aligned Title</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        printTemplate: {
                          ...settings.printTemplate,
                          titleAlignment: "center",
                        },
                      })
                    }
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                      settings.printTemplate.titleAlignment === "center"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <AlignCenter size={13} />
                    <span>Centered Title</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="sm:col-span-2 pt-2 border-t border-slate-100 space-y-3">
            <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-700">
              Master Document Footer Controls
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-3 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={settings.printTemplate.showSignatures ?? true}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      printTemplate: {
                        ...settings.printTemplate,
                        showSignatures: e.target.checked,
                      },
                    })
                  }
                  className="mt-0.5 h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
                />
                <div>
                  <span className="block font-body text-xs font-bold text-slate-800">
                    Include Physical Signature Blocks
                  </span>
                  <span className="block font-body text-[11px] text-slate-500">
                    Prints signature lines for Floor Receiver / QC Inspector / Supervisor handover proof.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-3 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={settings.printTemplate.showDisclaimer ?? false}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      printTemplate: {
                        ...settings.printTemplate,
                        showDisclaimer: e.target.checked,
                      },
                    })
                  }
                  className="mt-0.5 h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
                />
                <div>
                  <span className="block font-body text-xs font-bold text-slate-800">
                    Include Legal / Retention Notice
                  </span>
                  <span className="block font-body text-[11px] text-slate-500">
                    Prints small bottom disclaimer text (&quot;Confidential Warehouse Document&quot;).
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Live Document Preview Container */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-500">
              Live Printable Preview ({settings.printTemplate.previewOrientation.toUpperCase()} Layout)
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              Format: {settings.printTemplate.previewOrientation === "portrait" ? "8.5 x 11 in (Portrait)" : "11 x 8.5 in (Landscape)"}
            </span>
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-100/70 p-4 sm:p-6 overflow-x-auto flex justify-center">
            <div
              className={`bg-white rounded-lg border border-slate-300 shadow-elevation-1 p-6 transition-all duration-300 ${
                settings.printTemplate.previewOrientation === "portrait"
                  ? "w-full max-w-xl min-h-[500px]"
                  : "w-full max-w-3xl min-h-[380px]"
              }`}
            >
              <MasterDocumentHeader
                documentTitle="WAREHOUSE RECEIVING REPORT (WRR)"
                documentNumber="WRR-2026-10-0042"
                documentDate={new Date()}
                status="VERIFIED"
                warehouseName={settings.facility.facilityName}
                companyName={settings.printTemplate.companyName}
                logoUrl={settings.printTemplate.logoUrl}
                subtitle={settings.printTemplate.subtitle}
                facilityAddress={settings.printTemplate.facilityAddress}
                contactInfo={settings.printTemplate.contactInfo}
                taxOrPezaReg={settings.printTemplate.taxOrPezaReg}
                isoAccreditation={settings.printTemplate.isoAccreditation}
                headerAlignment={settings.printTemplate.headerAlignment ?? "left"}
                titleAlignment={settings.printTemplate.titleAlignment ?? "left"}
                orientation={settings.printTemplate.previewOrientation}
                showPrintButton={false}
              />

              {/* Sample Document Body Content */}
              <div className="space-y-2.5 pt-1.5">
                <div className="grid grid-cols-2 gap-2.5 text-[9px]">
                  <div className="rounded border border-slate-200 p-2 bg-slate-50/50">
                    <span className="font-bold text-slate-500 block uppercase text-[8px]">Supplier / Principal</span>
                    <strong className="text-slate-900 text-[9px]">UNIVERSAL COMPONENTS ASIA LTD.</strong>
                    <p className="text-slate-500 text-[8px]">Ecozone Logistics Supplier</p>
                  </div>
                  <div className="rounded border border-slate-200 p-2 bg-slate-50/50">
                    <span className="font-bold text-slate-500 block uppercase text-[8px]">Storage Model &amp; Terms</span>
                    <strong className="text-slate-900 text-[9px]">VMI Bonded Storage (Zone A)</strong>
                    <p className="text-slate-500 text-[8px]">LOA Reference: PEZA-LOA-2026-0891</p>
                  </div>
                </div>

                <div className="overflow-hidden border border-slate-200">
                  <table data-document-table className="w-full text-left text-[9px]">
                    <thead className="bg-slate-100 text-[8px] font-bold uppercase tracking-wider text-slate-700">
                      <tr>
                        <th className="p-2">Item Code</th>
                        <th className="p-2">Description</th>
                        <th className="p-2">Lot Number</th>
                        <th className="p-2 text-right">Quantity</th>
                        <th className="p-2 text-right">Volume (CBM)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-[9px]">
                      <tr>
                        <td className="p-2 font-bold text-slate-900">RES-10K-0805</td>
                        <td className="p-2 font-sans font-medium text-slate-700">SMD Resistor 10K Ohm 0805 Reel</td>
                        <td className="p-2 text-slate-600">LOT-20261013-01</td>
                        <td className="p-2 text-right font-bold">5,000 PCS</td>
                        <td className="p-2 text-right">0.024 CBM</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-bold text-slate-900">CAP-100U-16V</td>
                        <td className="p-2 font-sans font-medium text-slate-700">Aluminum Electrolytic Capacitor</td>
                        <td className="p-2 text-slate-600">LOT-20261013-02</td>
                        <td className="p-2 text-right font-bold">2,500 PCS</td>
                        <td className="p-2 text-right">0.048 CBM</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Standardized Master Document Footer in Sandbox */}
                <MasterDocumentFooter
                  showSignatures={settings.printTemplate.showSignatures ?? true}
                  showDisclaimer={settings.printTemplate.showDisclaimer ?? false}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {status && (
        <div
          className={`flex items-center gap-2 rounded-xl p-4 text-xs font-medium border ${
            status.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{status.message}</span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-navy px-6 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving Configuration..." : "Save General Settings"}
        </button>
      </div>
    </form>
  );
}
