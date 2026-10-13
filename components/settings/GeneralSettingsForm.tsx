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
} from "lucide-react";
import type { GeneralSettingsData } from "@/app/(authenticated)/settings/general/actions";
import { saveGeneralSettings } from "@/app/(authenticated)/settings/general/actions";
import { PhoneInputField } from "@/components/global/PhoneInputField";
import { MasterDocumentHeader } from "@/components/print/MasterDocumentHeader";

export function GeneralSettingsForm({ initialSettings }: { initialSettings: GeneralSettingsData }) {
  const [settings, setSettings] = useState<GeneralSettingsData>(() => ({
    ...initialSettings,
    printTemplate: initialSettings.printTemplate ?? {
      companyName: "DYNA-SERV ENTERPRISES / LOGISTICS",
      subtitle: "Warehouse Inventory Management System (WIMS)",
      facilityAddress: initialSettings.facility.physicalAddress,
      contactInfo: `Tel: ${initialSettings.facility.contactPhone} | Email: ${initialSettings.facility.contactEmail}`,
      taxOrPezaReg: `PEZA Reg. No. 01-1234 | VAT Reg. TIN: ${initialSettings.facility.tinNumber}`,
      isoAccreditation: "ISO 9001:2015 Certified Logistics Facility",
      previewOrientation: "portrait",
    },
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [hapticTested, setHapticTested] = useState(false);
  const [audioTested, setAudioTested] = useState(false);

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
              Configure inventory threshold triggers, QC quarantine dispatches, and daily report deliveries.
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

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.alerts.dailyPdfReportSubscription}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    alerts: {
                      ...settings.alerts,
                      dailyPdfReportSubscription: e.target.checked,
                    },
                  })
                }
                className="h-4 w-4 rounded text-brand-navy focus:ring-brand-navy"
              />
              <span className="font-body text-xs font-semibold text-slate-800">
                Daily automated Master Inventory &amp; Valuation PDF report delivery at shift closing (06:00 PM)
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
              PEZA Registration &amp; Tax ID / TIN
            </label>
            <input
              type="text"
              value={settings.printTemplate.taxOrPezaReg}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  printTemplate: {
                    ...settings.printTemplate,
                    taxOrPezaReg: e.target.value,
                  },
                })
              }
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy"
            />
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
                subtitle={settings.printTemplate.subtitle}
                facilityAddress={settings.printTemplate.facilityAddress}
                contactInfo={settings.printTemplate.contactInfo}
                taxOrPezaReg={settings.printTemplate.taxOrPezaReg}
                isoAccreditation={settings.printTemplate.isoAccreditation}
                orientation={settings.printTemplate.previewOrientation}
                showPrintButton={false}
              />

              {/* Sample Document Body Content */}
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="rounded border border-slate-200 p-2.5 bg-slate-50/50">
                    <span className="font-bold text-slate-600 block uppercase text-[10px]">Supplier / Principal</span>
                    <strong className="text-slate-900">UNIVERSAL COMPONENTS ASIA LTD.</strong>
                    <p className="text-slate-500 text-[11px]">PEZA Registered Ecozone Logistics Supplier</p>
                  </div>
                  <div className="rounded border border-slate-200 p-2.5 bg-slate-50/50">
                    <span className="font-bold text-slate-600 block uppercase text-[10px]">Storage Model &amp; Terms</span>
                    <strong className="text-slate-900">VMI Bonded Storage (Zone A)</strong>
                    <p className="text-slate-500 text-[11px]">LOA Reference: PEZA-LOA-2026-0891</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                      <tr>
                        <th className="p-2">Item Code</th>
                        <th className="p-2">Description</th>
                        <th className="p-2">Lot Number</th>
                        <th className="p-2 text-right">Quantity</th>
                        <th className="p-2 text-right">Volume (CBM)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
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

                <div className="grid grid-cols-3 gap-6 pt-4 text-center text-xs">
                  <div className="border-t border-slate-400 pt-1">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Received By (Staff)</span>
                    <strong className="text-slate-800">Juan Dela Cruz</strong>
                  </div>
                  <div className="border-t border-slate-400 pt-1">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Verified By (QC Inspector)</span>
                    <strong className="text-slate-800">Maria Santos</strong>
                  </div>
                  <div className="border-t border-slate-400 pt-1">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Authorized Signatory</span>
                    <strong className="text-slate-800">Warehouse Supervisor</strong>
                  </div>
                </div>
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
