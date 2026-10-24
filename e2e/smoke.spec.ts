import { test, expect } from "@playwright/test";

test.describe("smoke test", () => {
  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Oryn")).toBeVisible();
    await expect(page.locator("text=New project")).toBeVisible();
    await expect(page.locator("text=Viral remake")).toBeVisible();
  });

  test("product library page loads", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("text=Product library")).toBeVisible();
  });

  test("new project flow reaches the form", async ({ page }) => {
    await page.goto("/project/new");
    await expect(page.locator("text=Product images")).toBeVisible();
    await expect(page.locator("text=Product name")).toBeVisible();
    await expect(page.locator("text=Video mode")).toBeVisible();
  });

  test("settings page can switch tabs", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("text=AI Platform")).toBeVisible();
    await page.click("text=On-camera presenter");
    await expect(page.locator("text=Add presenter")).toBeVisible();
    await page.click("text=Brand settings");
    await expect(page.locator("text=Store name")).toBeVisible();
  });

  test("batch generation page loads", async ({ page }) => {
    await page.goto("/batch");
    await expect(page.locator("text=Batch render")).toBeVisible();
  });
});
