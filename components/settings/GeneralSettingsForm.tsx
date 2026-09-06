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
} from "lucide-react";
import type { GeneralSettingsData } from "@/app/(authenticated)/settings/general/actions";
import { saveGeneralSettings } from "@/app/(authenticated)/settings/general/actions";

export function GeneralSettingsForm({ initialSettings }: { initialSettings: GeneralSettingsData }) {
  const [settings, setSettings] = useState<GeneralSettingsData>(initialSettings);
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
      {/* ── Section 1: Facility & Site Preferences ─────────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
            <Warehouse className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold text-slate-900">Facility &amp; Site Preferences</h2>
            <p className="font-body text-xs text-slate-500">
              Active warehouse hub identity, localized operational shift clock, and zone routing defaults.
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Active Facility / Hub
            </label>
            <select
              value={settings.facility.warehouseId}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  facility: { ...settings.facility, warehouseId: e.target.value },
                })
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            >
              <option value="WH-01">Main Laguna Hub — Biñan (WH-01)</option>
              <option value="WH-02">Cabuyao Extension Hub (WH-02)</option>
              <option value="WH-03">Makati Forwarding Station (WH-03)</option>
            </select>
          </div>

          <div>
            <label className="block font-label text-xs font-bold text-slate-700 mb-1">
              Default Zone for New Floor Logins
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
