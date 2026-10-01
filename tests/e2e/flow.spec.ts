import { expect, test } from "@playwright/test";
import path from "node:path";

test("profile → photo step rejects a photo with no person (pose model loads in the browser)", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.locator("html[lang]").waitFor();
  await page.getByRole("button", { name: "EN" }).click();

  // validation
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("120 and 230");

  await page.getByLabel("Height").fill("175");
  await page.getByLabel("Weight (optional)").fill("78");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Front-facing, full-body photo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await page.getByTestId("photo-input").setInputFiles(path.join("tests/fixtures/blank.png"));
  await expect(page.getByRole("alert")).toContainText("couldn't detect a person", { timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("imperial units convert height and persist the profile", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: "EN" }).click();
  await page.getByRole("button", { name: "ft-in / lb" }).click();
  await page.getByPlaceholder("ft").fill("5");
  await page.getByPlaceholder("in", { exact: true }).fill("9");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Front-facing, full-body photo")).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bsc:v1")!));
  expect(stored.profile.heightCm).toBeCloseTo(175.26, 1);
  expect(JSON.stringify(stored)).not.toContain("blob:");
});
