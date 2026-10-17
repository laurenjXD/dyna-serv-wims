import { describe, expect, it } from "vitest";
import { getSafeCallbackPath } from "@/lib/auth/invite-callback";

describe("invitation callback redirect safety", () => {
  it("keeps the onboarding path for a missing next value", () => {
    expect(getSafeCallbackPath(null)).toBe("/accept-invite");
  });

  it("allows internal onboarding and error paths", () => {
    expect(getSafeCallbackPath("/accept-invite")).toBe("/accept-invite");
    expect(getSafeCallbackPath("/login?error=invitation_invalid")).toBe("/login?error=invitation_invalid");
  });

  it("blocks external and protocol-relative redirects", () => {
    expect(getSafeCallbackPath("https://example.com")).toBe("/accept-invite");
    expect(getSafeCallbackPath("//example.com")).toBe("/accept-invite");
    expect(getSafeCallbackPath("/\\/example.com")).toBe("/accept-invite");
  });
});
