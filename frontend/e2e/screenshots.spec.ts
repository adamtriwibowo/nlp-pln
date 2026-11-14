import { test } from "@playwright/test";
import path from "node:path";

import { expectPdfRendered, openAnswer } from "./helpers";

// Only runs with SCREENSHOTS=1 (writes docs/screenshots/*.png).
const out = (name: string) =>
  path.join(__dirname, "..", "..", "docs", "screenshots", name);

test.skip(
  !process.env.SCREENSHOTS,
  "set SCREENSHOTS=1 to capture docs/screenshots",
);

test.describe("tangkapan layar", () => {
  test.use({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });

  test("beranda desktop", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Permen ESDM No. 10 Tahun 2021").waitFor();
    await page.screenshot({ path: out("01-beranda-desktop.png") });
  });

  test("jawaban + panel sumber + PDF (terang)", async ({ page }) => {
    await openAnswer(page);
    await page.getByTestId("cite-1").click();
    await page
      .getByTestId("source-panel")
      .getByTestId("pdf-highlight")
      .first()
      .waitFor({ timeout: 30_000 });
    await expectPdfRendered(page.getByTestId("source-panel"));
    await page.screenshot({ path: out("02-jawaban-sumber-desktop.png") });
  });

  test("jawaban + panel sumber (gelap)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openAnswer(page);
    await page.getByTestId("cite-1").click();
    await page
      .getByTestId("source-panel")
      .getByTestId("pdf-highlight")
      .first()
      .waitFor({ timeout: 30_000 });
    await expectPdfRendered(page.getByTestId("source-panel"));
    await page.screenshot({ path: out("03-jawaban-sumber-gelap.png") });
  });
});

test.describe("tangkapan layar ponsel", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });

  test("bottom sheet sumber", async ({ page }) => {
    await openAnswer(page);
    await page.getByTestId("cite-1").click();
    await page
      .getByTestId("bottom-sheet")
      .getByTestId("pdf-highlight")
      .first()
      .waitFor({ timeout: 30_000 });
    await expectPdfRendered(page.getByTestId("bottom-sheet"));
    await page.screenshot({ path: out("04-sumber-ponsel.png") });
  });
});
