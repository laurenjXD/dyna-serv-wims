// @vitest-environment jsdom
//
// Tests <PreferencesTab> + <UserPreferencesProvider>'s real toggle/persist
// logic (specs/21's Task 21.4).

import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserPreferencesProvider } from "@/lib/user-settings/preferences";
import { PreferencesTab } from "../PreferencesTab";

function renderTab() {
  return render(
    <UserPreferencesProvider>
      <PreferencesTab />
    </UserPreferencesProvider>,
  );
}

describe("PreferencesTab (Task 21.4)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with dark mode and compact density both off", () => {
    renderTab();
    expect(screen.getByTestId("dark-mode-toggle")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("density-toggle")).toHaveAttribute("aria-checked", "false");
  });

  it("toggles dark mode on click and persists it to localStorage", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByTestId("dark-mode-toggle"));

    expect(screen.getByTestId("dark-mode-toggle")).toHaveAttribute("aria-checked", "true");
    const stored = JSON.parse(window.localStorage.getItem("wims:user-preferences") ?? "{}");
    expect(stored.darkMode).toBe(true);
  });

  it("toggles density independently of dark mode", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByTestId("density-toggle"));

    expect(screen.getByTestId("density-toggle")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("dark-mode-toggle")).toHaveAttribute("aria-checked", "false");
    const stored = JSON.parse(window.localStorage.getItem("wims:user-preferences") ?? "{}");
    expect(stored.density).toBe("compact");
  });

  it("hydrates from an existing localStorage value on mount", () => {
    window.localStorage.setItem(
      "wims:user-preferences",
      JSON.stringify({ darkMode: true, density: "compact" }),
    );
    renderTab();
    expect(screen.getByTestId("dark-mode-toggle")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("density-toggle")).toHaveAttribute("aria-checked", "true");
  });
});
