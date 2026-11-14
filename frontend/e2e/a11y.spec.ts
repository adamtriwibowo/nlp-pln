import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ADMIN_TOKEN, loginUi, mockAsk, openAnswer } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
  );
  expect(summary, `${label}: axe violations`).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`aksesibilitas, tema ${theme}`, () => {
    test.use({ colorScheme: theme });

    test("beranda", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByText("Permen ESDM No. 10 Tahun 2021"),
      ).toBeVisible();
      await expectNoViolations(page, `beranda ${theme}`);
    });

    test("jawaban dengan panel sumber terbuka", async ({ page }) => {
      await openAnswer(page);
      await page.getByTestId("cite-1").click();
      await expect(
        page.getByTestId("source-panel").locator("canvas"),
      ).toBeVisible({ timeout: 30_000 });
      await expectNoViolations(page, `jawaban ${theme}`);
    });

    test("masuk", async ({ page }) => {
      await page.goto("/masuk");
      await expectNoViolations(page, `masuk ${theme}`);
    });

    test("admin", async ({ page }) => {
      await page.route("**/api/admin/eval-runs", (route) =>
        route.fulfill({ contentType: "application/json", body: "[]" }),
      );
      await loginUi(page, ADMIN_TOKEN);
      await expect(page.getByTestId("doc-D2")).toBeVisible();
      await expectNoViolations(page, `admin ${theme}`);
    });
  });
}

test("tema manual: tombol mengganti tema dan pilihan bertahan setelah muat ulang", async ({
  page,
}) => {
  await mockAsk(page);
  await page.goto("/");
  const before = await page.evaluate(
    () => document.documentElement.dataset.theme ?? "",
  );
  await page.getByRole("button", { name: /Pakai tema (gelap|terang)/ }).click();
  const after = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  expect(["light", "dark"]).toContain(after);
  expect(after).not.toBe(before);
  await page.reload();
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe(after);
});

test("fokus keyboard terlihat dan skip-link bekerja", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Lewati ke konten" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  const outline = await page.evaluate(
    () => getComputedStyle(document.activeElement!).outlineStyle,
  );
  expect(outline).not.toBe("none");
});
