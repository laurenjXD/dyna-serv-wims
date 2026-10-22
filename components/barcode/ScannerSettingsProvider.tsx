"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface ScannerSettings {
  continuousStream: boolean;
  torchDefault: boolean;
  tapToFocus: boolean;
  symbologies: { code128: boolean; qrCode: boolean; dataMatrix: boolean; gs1128: boolean };
  hapticFeedback: boolean;
  audioAlertTone: boolean;
}

const defaultScannerSettings: ScannerSettings = {
  continuousStream: true,
  torchDefault: false,
  tapToFocus: true,
  symbologies: { code128: true, qrCode: true, dataMatrix: true, gs1128: true },
  hapticFeedback: true,
  audioAlertTone: true,
};

const ScannerSettingsContext = createContext<ScannerSettings>(defaultScannerSettings);

export function ScannerSettingsProvider({ settings, children }: { settings: ScannerSettings; children: ReactNode }) {
  return <ScannerSettingsContext.Provider value={settings}>{children}</ScannerSettingsContext.Provider>;
}

export function useScannerSettings() {
  return useContext(ScannerSettingsContext);
}
