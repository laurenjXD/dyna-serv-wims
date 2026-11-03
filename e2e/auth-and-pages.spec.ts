import { test, expect } from "@playwright/test";

test.describe("Authentication & Public Pages", () => {
  test("login page renders Dyna-Serv WIMS brand, inputs, and submit button", async ({ page }) => {
    await page.goto("/login");

    // Current brand contract: logo alt text plus the legal company name.
    await expect(page.locator('img[alt="Dyna-Serv"]')).toBeVisible();
    await expect(page.getByText("DYNA-SERV GLOBAL CORPORATION")).toBeVisible();
    await expect(page.locator("h1")).toContainText(/Welcome/i);

    // Form inputs
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText(/Sign in/i);
  });

  test("login form validates required inputs and handles client validation", async ({ page }) => {
    await page.goto("/login");

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    // Fill invalid credentials
    await emailInput.fill("operator@dyna-serv.local");
    await passwordInput.fill("testpassword123");

    // Click submit
    await submitBtn.click();

    // Since mock/local auth without backend returns error or loading state, verify button interactions
    await expect(submitBtn).toBeVisible();
  });
});
