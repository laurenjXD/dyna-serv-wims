import { test, expect } from "@playwright/test";

test.describe("Floor Surface & Responsive Design", () => {
  test("login page renders with accessible mobile viewport", async ({ page }) => {
    // Set floor mobile viewport (375x667 standard)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");

    await expect(page.locator("text=Dyna-Serv WIMS")).toBeVisible();
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();

    // Verify touch target height is at least 44px
    const box = await submitBtn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("accept-invite page renders properly", async ({ page }) => {
    await page.goto("/accept-invite");
    // Verify page loads without crashing
    await expect(page).toHaveURL(/accept-invite/);
  });
});
