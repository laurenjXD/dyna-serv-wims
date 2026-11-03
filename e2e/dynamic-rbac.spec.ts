import { test, expect, type Page } from "@playwright/test";

// Opt-in only: requires an isolated deployment/database with migration 0071 and
// two disposable active accounts. Never use real staff/production credentials.
// Set RBAC_E2E_ALLOW_MUTATIONS=1 and RBAC_E2E_ADMIN_EMAIL/PASSWORD,
// RBAC_E2E_WORKER_EMAIL/PASSWORD before running this spec. No email is sent.
const adminEmail = process.env.RBAC_E2E_ADMIN_EMAIL;
const adminPassword = process.env.RBAC_E2E_ADMIN_PASSWORD;
const workerEmail = process.env.RBAC_E2E_WORKER_EMAIL;
const workerPassword = process.env.RBAC_E2E_WORKER_PASSWORD;
const enabled = process.env.RBAC_E2E_ALLOW_MUTATIONS === "1" && Boolean(adminEmail && adminPassword && workerEmail && workerPassword) && adminEmail !== workerEmail;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}
async function openAccount(page: Page) {
  await page.goto("/settings/team");
  await page.getByPlaceholder("Search by Name, Employee ID, Email, or Role...").fill(workerEmail!);
  await page.getByRole("row").filter({ hasText: workerEmail! }).getByRole("button", { name: "Manage Access" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: /Current effective permissions/ })).toBeVisible();
}
async function saveAccount(page: Page, selectedNames: string[], reason: string) {
  const dialog = page.getByRole("dialog");
  for (const checkbox of await dialog.locator("fieldset input[type=checkbox]").all()) {
    await checkbox.setChecked(selectedNames.includes((await checkbox.getAttribute("aria-label")) ?? ""));
  }
  await dialog.getByLabel("Reason for change").fill(reason);
  await dialog.getByLabel("I confirm these access changes for this account.").check();
  await dialog.getByRole("button", { name: "Save account access" }).click();
  await expect(dialog).not.toBeVisible();
}

test.describe("dynamic RBAC with independent authenticated browsers", () => {
  test.skip(!enabled, "Requires explicit mutation opt-in and disposable admin/worker credentials");
  test("custom grant persistence, per-account isolation, and next-request revocation", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Shared disposable account mutation lifecycle runs once in desktop Chromium");
    test.setTimeout(120_000);
    const adminContext = await browser.newContext();
    const workerContext = await browser.newContext();
    const admin = await adminContext.newPage();
    const worker = await workerContext.newPage();
    const key = `e2e_receiving_${Date.now()}`;
    const name = `E2E Receiving ${Date.now()}`;
    let originalRoles: string[] | null = null;
    let roleCreated = false;
    try {
      await signIn(admin, adminEmail!, adminPassword!);
      await admin.goto("/settings/team");
      await admin.getByRole("button", { name: "Manage Roles" }).click();
      await admin.getByRole("button", { name: "Create role", exact: true }).click();
      const editor = admin.getByRole("dialog");
      await editor.getByLabel("Role key", { exact: true }).fill(key);
      await editor.getByLabel("Role name", { exact: true }).fill(name);
      await editor.getByRole("checkbox", { name: "receiving.view — Warehouse-wide", exact: true }).check();
      await editor.getByLabel("Reason for change").fill("Disposable RBAC browser verification");
      await editor.getByLabel("I confirm these access changes and their effect on assigned accounts.").check();
      await editor.getByRole("button", { name: "Save role", exact: true }).click();
      await expect(editor).not.toBeVisible(); roleCreated = true;
      await openAccount(admin);
      originalRoles = await admin.getByRole("dialog").locator("fieldset input[type=checkbox]:checked").evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")!));
      await saveAccount(admin, [name], "Temporary receiving-only verification");
      await signIn(worker, workerEmail!, workerPassword!);
      await worker.goto("/receiving");
      await expect(worker.getByText("You don't have access to this page or resource.", { exact: true })).toHaveCount(0);
      await expect(worker.locator("h1").first()).toBeVisible();
      await worker.goto("/settings/team");
      await expect(worker.getByRole("button", { name: "Manage Roles" })).toHaveCount(0);
      await expect(worker.getByRole("button", { name: "Invite Operator" })).toHaveCount(0);
      await openAccount(admin);
      await saveAccount(admin, [], "Verify revocation without signing worker out");
      await worker.goto("/receiving");
      await expect(worker.getByText(/doesn't have any access configured|don't have access|access.*configured/i).first()).toBeVisible();
    } finally {
      if (originalRoles !== null) {
        await openAccount(admin);
        await saveAccount(admin, originalRoles, "Restore disposable account after browser verification");
      }
      if (roleCreated) {
        await admin.goto("/settings/team");
        await admin.getByRole("button", { name: "Manage Roles" }).click();
        const dialog = admin.getByRole("dialog");
        await dialog.getByRole("button").filter({ hasText: name }).click();
        await dialog.getByLabel("Reason for change").fill("Browser verification complete");
        await dialog.getByLabel("I confirm these access changes and their effect on assigned accounts.").check();
        await dialog.getByRole("button", { name: "Deactivate role" }).click();
        await expect(dialog).not.toBeVisible();
      }
      await adminContext.close(); await workerContext.close();
    }
  });
});
