// Unit tests for lib/user-settings/preferences.tsx's pure (DOM-free)
// parse/serialize helpers. The React Context/Provider itself is exercised
// indirectly through components/profile/__tests__/PreferencesTab.test.tsx.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  serializePreferences,
} from "../preferences";

describe("parsePreferences", () => {
  it("returns the default preferences for null input", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns the default preferences for malformed JSON", () => {
    expect(parsePreferences("{not json")).toEqual(DEFAULT_PREFERENCES);
  });

  it("round-trips a valid preferences object through serialize/parse", () => {
    const preferences = { darkMode: true, density: "compact" as const };
    expect(parsePreferences(serializePreferences(preferences))).toEqual(preferences);
  });

  it("falls back density to 'standard' for an unrecognized value", () => {
    const parsed = parsePreferences(JSON.stringify({ darkMode: true, density: "huge" }));
    expect(parsed.density).toBe("standard");
  });

  it("falls back darkMode to the default when missing/non-boolean", () => {
    const parsed = parsePreferences(JSON.stringify({ density: "compact" }));
    expect(parsed.darkMode).toBe(DEFAULT_PREFERENCES.darkMode);
  });
});
