import { test } from "@playwright/test";
import path from "node:path";

import { expectPdfRendered, gotoSection, openAnswer } from "./helpers";

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
    await page.getByTestId("new-chat").waitFor();
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

test.describe("tangkapan layar admin", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });

  test("ringkasan, dataset, uji pertanyaan, konfigurasi", async ({ page }) => {
    await page.request.post("/api/auth/login", {
      data: { token: "e2e-admin-token" },
    });
    const seed = [
      [
        "q001",
        "dev",
        "factual",
        ["D2-P18"],
        "Kapan instalasi tenaga listrik boleh dioperasikan?",
      ],
      [
        "q002",
        "dev",
        "factual",
        ["D2-P35"],
        "Siapa yang bertanggung jawab atas penerapan SMK2?",
      ],
      [
        "q003",
        "dev",
        "unanswerable",
        [],
        "Berapa harga tiket pesawat ke Bali?",
      ],
      [
        "q004",
        "test",
        "multihop",
        ["D2-P20", "D2-P22"],
        "Apa kewajiban struktur organisasi dan pemeliharaan instalasi?",
      ],
    ] as const;
    for (const [id, split, type, gold, question] of seed) {
      await page.request.post("/api/admin/qa", {
        data: {
          id,
          split,
          type,
          gold_chunk_ids: gold,
          question,
          reference_answer: "(contoh data tangkapan layar)",
          source_note: "contoh",
        },
      });
    }
    await page.goto("/admin");
    await page.getByTestId("readiness").waitFor();
    await page.screenshot({
      path: out("09-admin-ringkasan.png"),
      fullPage: true,
    });
    await page.getByTestId("collapse-sidebar").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: out("10-admin-sidebar-ciut.png") });
    await page.getByTestId("collapse-sidebar").click();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: out("11-admin-ringkasan-gelap.png"),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "light" });
    await gotoSection(page, "Dataset");
    await page.getByTestId("qa-row-q001").waitFor();
    await page.screenshot({
      path: out("06-admin-dataset.png"),
      fullPage: true,
    });

    await gotoSection(page, "Uji pertanyaan");
    await page
      .getByLabel("Pertanyaan", { exact: true })
      .fill("sertifikat laik operasi sebelum instalasi dioperasikan");
    await page.getByLabel(/Chunk gold/).fill("D2-P18");
    await page
      .getByRole("combobox", { name: "Konfigurasi" })
      .selectOption("B1");
    await page.getByTestId("run-playground").click();
    await page.getByTestId("playground-result").waitFor();
    await page.screenshot({
      path: out("07-admin-uji-pertanyaan.png"),
      fullPage: true,
    });

    await gotoSection(page, "Konfigurasi");
    await page.getByTestId("configs").waitFor();
    await page.screenshot({
      path: out("08-admin-konfigurasi.png"),
      fullPage: true,
    });
  });
});

test.describe("tangkapan layar admin ponsel", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });

  test("laci menu", async ({ page }) => {
    await page.request.post("/api/auth/login", {
      data: { token: "e2e-admin-token" },
    });
    await page.goto("/admin");
    await page.getByTestId("readiness").waitFor();
    await page.screenshot({ path: out("12-admin-ponsel.png") });
    await page.getByTestId("open-drawer").click();
    await page.getByTestId("admin-drawer").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: out("13-admin-laci-ponsel.png") });
  });
});
