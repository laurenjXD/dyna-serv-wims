// @vitest-environment jsdom
//
// Tests <ProfileContainer>'s floor-default stacked-sections shape — the
// real, non-markup behavior called out for the profile shell
// (specs/21-user-profile-and-settings design.md §1.1's 2026-08-08
// amendment, tasks.md Task 21.1). Tabs were replaced by three always-
// rendered `<section>`s (Account/Security/Preferences) per
// brand-design-system.md §3 ("tabs... are office patterns").

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OwnProfile } from "@/app/(authenticated)/profile/actions";

vi.mock("@/app/(authenticated)/profile/actions", () => ({
  updateDisplayName: vi.fn(async () => ({ ok: true })),
  changePassword: vi.fn(async () => ({ ok: true })),
  getOwnProfile: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      mfa: {
        listFactors: vi.fn(async () => ({ data: { totp: [] } })),
        enroll: vi.fn(async () => ({ data: null, error: null })),
      },
    },
  }),
}));

import { ProfileContainer } from "../ProfileContainer";

const profile: OwnProfile = {
  id: "user-1",
  email: "user@example.com",
  displayName: "Jane Doe",
  status: "active",
  lastSignInAt: null,
};

describe("ProfileContainer (design.md §1.1, 2026-08-08 amendment, Task 21.1)", () => {
  it("renders all three sections simultaneously, none hidden behind a tab", () => {
    render(<ProfileContainer profile={profile} />);
    expect(screen.getByTestId("profile-section-account")).toBeInTheDocument();
    expect(screen.getByTestId("profile-section-security")).toBeInTheDocument();
    expect(screen.getByTestId("profile-section-preferences")).toBeInTheDocument();
    expect(screen.getByTestId("profile-section-account")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("profile-section-security")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("profile-section-preferences")).not.toHaveAttribute("hidden");
  });

  it("renders the Account section's fields without needing any interaction", () => {
    render(<ProfileContainer profile={profile} />);
    expect(screen.getByTestId("display-name-input")).toBeInTheDocument();
  });

  it("renders the Security section's password form without needing any interaction", () => {
    render(<ProfileContainer profile={profile} />);
    expect(screen.getByTestId("new-password-input")).toBeInTheDocument();
  });

  it("renders the Preferences section's toggles without needing any interaction", () => {
    render(<ProfileContainer profile={profile} />);
    expect(screen.getByTestId("dark-mode-toggle")).toBeInTheDocument();
  });

  it("never renders a tablist/tab role — tabs are an office-only pattern (brand-design-system.md §3)", () => {
    render(<ProfileContainer profile={profile} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
