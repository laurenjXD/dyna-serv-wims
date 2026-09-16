"use client";

import { useState, useEffect, useId } from "react";
import { ChevronDown } from "lucide-react";

export interface CountryOption {
  code: string; // ISO 2-letter
  name: string;
  dialCode: string;
  flag: string;
  formatPlaceholder: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: "PH", name: "Philippines", dialCode: "+63", flag: "🇵🇭", formatPlaceholder: "917 123 4567" },
  { code: "US", name: "United States / Canada", dialCode: "+1", flag: "🇺🇸", formatPlaceholder: "(555) 123-4567" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵", formatPlaceholder: "90 1234 5678" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬", formatPlaceholder: "8123 4567" },
  { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳", formatPlaceholder: "138 1234 5678" },
  { code: "HK", name: "Hong Kong", dialCode: "+852", flag: "🇭🇰", formatPlaceholder: "9123 4567" },
  { code: "TW", name: "Taiwan", dialCode: "+886", flag: "🇹🇼", formatPlaceholder: "912 345 678" },
  { code: "KR", name: "South Korea", dialCode: "+82", flag: "🇰🇷", formatPlaceholder: "10 1234 5678" },
  { code: "MY", name: "Malaysia", dialCode: "+60", flag: "🇲🇾", formatPlaceholder: "12 345 6789" },
  { code: "VN", name: "Vietnam", dialCode: "+84", flag: "🇻🇳", formatPlaceholder: "91 234 5678" },
  { code: "TH", name: "Thailand", dialCode: "+66", flag: "🇹🇭", formatPlaceholder: "81 234 5678" },
  { code: "ID", name: "Indonesia", dialCode: "+62", flag: "🇮🇩", formatPlaceholder: "812 3456 7890" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺", formatPlaceholder: "412 345 678" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧", formatPlaceholder: "7911 123456" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪", formatPlaceholder: "151 12345678" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪", formatPlaceholder: "50 123 4567" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦", formatPlaceholder: "50 123 4567" },
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳", formatPlaceholder: "98765 43210" },
];

function parseRawPhone(raw: string | undefined | null): { country: CountryOption; national: string } {
  if (!raw) {
    return { country: COUNTRY_OPTIONS[0]!, national: "" };
  }

  const trimmed = raw.trim();

  // Check if string matches any known dial code
  for (const c of COUNTRY_OPTIONS) {
    if (trimmed.startsWith(c.dialCode)) {
      const remaining = trimmed.slice(c.dialCode.length).trim();
      return { country: c, national: remaining };
    }
  }

  // If starts with 09... (typical PH mobile format)
  if (/^09\d+/.test(trimmed)) {
    return { country: COUNTRY_OPTIONS[0]!, national: trimmed.slice(1) };
  }

  return { country: COUNTRY_OPTIONS[0]!, national: trimmed };
}

export interface PhoneInputFieldProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (fullFormattedValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

export function PhoneInputField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required = false,
  disabled = false,
  readOnly = false,
  placeholder,
  className = "",
  inputClassName = "",
  "aria-label": ariaLabel,
  "data-testid": testId,
}: PhoneInputFieldProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const initial = parseRawPhone(value !== undefined ? value : defaultValue);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(initial.country);
  const [nationalNumber, setNationalNumber] = useState<string>(initial.national);

  // Sync if controlled value changes externally
  useEffect(() => {
    if (value !== undefined) {
      const parsed = parseRawPhone(value);
      setSelectedCountry(parsed.country);
      setNationalNumber(parsed.national);
    }
  }, [value]);

  const computeFullValue = (country: CountryOption, number: string) => {
    const cleanNumber = number.trim();
    if (!cleanNumber) return "";
    return `${country.dialCode} ${cleanNumber}`;
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const country = COUNTRY_OPTIONS.find((c) => c.code === code) || COUNTRY_OPTIONS[0]!;
    setSelectedCountry(country);
    const full = computeFullValue(country, nationalNumber);
    onChange?.(full);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;
    setNationalNumber(inputVal);
    const full = computeFullValue(selectedCountry, inputVal);
    onChange?.(full);
  };

  const fullValue = computeFullValue(selectedCountry, nationalNumber);

  return (
    <div
      className={`relative flex items-center rounded-xl border border-slate-200 bg-white transition-all shadow-2xs focus-within:border-brand-navy focus-within:ring-2 focus-within:ring-brand-navy/10 ${
        disabled ? "bg-slate-50 opacity-70 cursor-not-allowed" : ""
      } ${className}`}
    >
      {/* Hidden input for standard form submission with Server Actions */}
      {name && <input type="hidden" name={name} value={fullValue} />}

      {/* Country Code Selector */}
      <div className="relative flex items-center shrink-0 border-r border-slate-200/80 bg-slate-50/80 rounded-l-xl hover:bg-slate-100 transition-colors">
        <span className="pl-3 pr-1 text-base select-none" aria-hidden="true">
          {selectedCountry.flag}
        </span>
        <span className="font-mono text-xs font-bold text-slate-700 select-none pr-1">
          {selectedCountry.dialCode}
        </span>
        <ChevronDown size={14} className="text-slate-400 mr-2 pointer-events-none" />
        <select
          aria-label="Country calling code"
          disabled={disabled || readOnly}
          value={selectedCountry.code}
          onChange={handleCountryChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        >
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} ({c.dialCode})
            </option>
          ))}
        </select>
      </div>

      {/* National Phone Number Input */}
      <div className="relative flex-1 flex items-center min-w-0">
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          onChange={handleNumberChange}
          placeholder={placeholder || selectedCountry.formatPlaceholder}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={ariaLabel || "Contact phone number"}
          data-testid={testId || "contact-phone-input"}
          className={`h-10 w-full bg-transparent px-3 font-body text-sm text-slate-900 placeholder:text-slate-400 outline-none disabled:cursor-not-allowed ${inputClassName}`}
        />
      </div>
    </div>
  );
}
