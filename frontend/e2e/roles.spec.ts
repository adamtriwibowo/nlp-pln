import { expect, test } from "@playwright/test";

import { ADMIN_TOKEN, appAlert, loginUi, REVIEW_TOKEN } from "./helpers";

const ITEM = {
  item_id: 7,
  question: "Siapa yang bertanggung jawab terhadap penerapan SMK2?",
  answer: {
    answer: "Pemilik instalasi bertanggung jawab terhadap penerapan SMK2 [1].",
    abstained: false,
    citations: [
      {
        label: 1,
        chunk_id: "D2-P35",
        quote:
          "Pemilik Instalasi Tenaga Listrik bertanggung jawab terhadap penerapan SMK2.",
        ref: "Pasal 35",
        doc_title: "Permen ESDM 10/2021",
        page_start: 21,
        text: "(1) Pemilik Instalasi Tenaga Listrik bertanggung jawab terhadap penerapan SMK2.",
      },
    ],
  },
};

test.describe("masuk", () => {
  test("token salah menampilkan galat; penilai wajib mengisi nama", async ({
    page,
  }) => {
    await loginUi(page, "salah", "Dr. Budi");
    await expect(appAlert(page)).toContainText("Token tidak valid");
    await loginUi(page, REVIEW_TOKEN); // valid token, but no name
    await expect(appAlert(page)).toContainText("nama penilai");
  });

  test("rute dilindungi: tanpa login diarahkan ke /masuk", async ({ page }) => {
    await page.goto("/review");
    await expect(page).toHaveURL(/\/masuk\?next=%2Freview/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/masuk\?next=%2Fadmin/);
  });

  test("penilai tidak bisa membuka admin", async ({ page }) => {
    await loginUi(page, REVIEW_TOKEN, "Dr. Budi");
    await expect(page).toHaveURL(/\/review/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/masuk\?next=%2Fadmin/);
  });
});

test.describe("review", () => {
  test("nilai dengan pintasan keyboard, kirim, lanjut ke item berikutnya, progres bertambah", async ({
    page,
  }) => {
    let served = 0;
    const posted: unknown[] = [];
    await page.route("**/api/review/items", (route) => {
      const first = served === 0;
      served += 1;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          first
            ? { item: ITEM, progress: { done: 0, total: 2 } }
            : {
                item: { ...ITEM, item_id: 8, question: "Pertanyaan kedua?" },
                progress: { done: 1, total: 2 },
              },
        ),
      });
    });
    await page.route("**/api/review/scores", (route) => {
      posted.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", progress: { done: 1, total: 2 } }),
      });
    });

    await loginUi(page, REVIEW_TOKEN, "Dr. Budi");
    await expect(page).toHaveURL(/\/review/);
    await expect(page.getByTestId("review-question")).toHaveText(ITEM.question);
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    // the reviewer never sees a configuration name
    await expect(page.locator("body")).not.toContainText(
      /\b(M1|B0|B1|B2|M3)\b/,
    );

    await expect(page.getByTestId("submit-score")).toBeDisabled();
    await page.keyboard.press("4"); // kebenaran -> next row
    await page.keyboard.press("3"); // kelengkapan
    await page.keyboard.press("5"); // kegunaan
    await page.keyboard.press("s"); // toggle "sitasi mendukung klaim" off
    await expect(page.getByTestId("score-correctness-4")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByTestId("score-usefulness-5")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page
      .getByLabel("Komentar (opsional)")
      .fill("Kutipan kurang spesifik");
    await page.getByTestId("submit-score").click();

    await expect(page.getByTestId("review-question")).toHaveText(
      "Pertanyaan kedua?",
    );
    expect(posted).toEqual([
      {
        item_id: 7,
        correctness: 4,
        completeness: 3,
        usefulness: 5,
        citation_ok: false,
        comment: "Kutipan kurang spesifik",
      },
    ]);
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    await expect(page.getByTestId("submit-score")).toBeDisabled(); // form reset for the new item
  });

  test("teks pasal sitasi bisa dibuka untuk verifikasi; ekspor CSV tersedia", async ({
    page,
  }) => {
    await page.route("**/api/review/items", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ item: ITEM, progress: { done: 0, total: 1 } }),
      }),
    );
    await loginUi(page, REVIEW_TOKEN, "Dr. Budi");
    await page.getByRole("button", { name: "Lihat teks pasal" }).click();
    await expect(
      page.getByText("(1) Pemilik Instalasi Tenaga Listrik bertanggung jawab"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ekspor CSV" }),
    ).toHaveAttribute("href", "/api/review/export.csv");
  });

  test("keadaan kosong jelas bila belum ada item", async ({ page }) => {
    await page.route("**/api/review/items", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ item: null, progress: { done: 0, total: 0 } }),
      }),
    );
    await loginUi(page, REVIEW_TOKEN, "Penilai Kosong");
    await expect(page.getByTestId("review-empty")).toContainText(
      "Belum ada item untuk dinilai",
    );
  });
});

test.describe("admin", () => {
  test("daftar dokumen nyata dengan status ingesti", async ({ page }) => {
    await loginUi(page, ADMIN_TOKEN);
    await expect(page).toHaveURL(/\/admin/);
    const d2 = page.getByTestId("doc-D2");
    await expect(d2).toContainText("Peraturan Menteri ESDM");
    await expect(d2).toContainText("ada (");
    await expect(page.getByTestId("doc-D5")).toContainText("belum diunduh");
    await expect(page.getByTestId("doc-D4")).toContainText("tidak"); // not indexed
  });

  test("re-index berjalan sebagai job latar dengan status yang di-poll", async ({
    page,
  }) => {
    let polls = 0;
    await page.route("**/api/admin/reindex", (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          id: "job1",
          status: "running",
          log: [],
          error: null,
          started_at: "t",
          finished_at: null,
        }),
      }),
    );
    await page.route("**/api/admin/jobs/job1", (route) => {
      polls += 1;
      const done = polls >= 2;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "job1",
          status: done ? "done" : "running",
          log: done
            ? ["Ingesti PDF...", "Embedding: 0 baru, 126 tetap"]
            : ["Ingesti PDF..."],
          error: null,
          started_at: "t",
          finished_at: done ? "t2" : null,
        }),
      });
    });
    await loginUi(page, ADMIN_TOKEN);
    await page.getByTestId("reindex").click();
    await expect(page.getByTestId("job-status")).toHaveText("Berjalan");
    await expect(page.getByTestId("job-status")).toHaveText("Selesai", {
      timeout: 20_000,
    });
    await expect(page.getByText("Embedding: 0 baru, 126 tetap")).toBeVisible();
  });

  test("unggahan bukan-PDF ditolak server dengan pesan jelas (backend nyata)", async ({
    page,
  }) => {
    await loginUi(page, ADMIN_TOKEN);
    await page.getByText("Unggah PDF baru").click();
    await page.getByLabel("Berkas PDF (maks. 30 MB)").setInputFiles({
      name: "palsu.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("ini bukan pdf"),
    });
    await page.getByLabel("Judul dokumen").fill("Dokumen Uji Palsu");
    await page.getByLabel("Penerbit").fill("Uji");
    await page.getByRole("button", { name: "Unggah", exact: true }).click();
    await expect(appAlert(page)).toContainText("bukan PDF");
  });

  test("tab Evaluasi: keadaan kosong, lalu perbandingan dua run (data mock)", async ({
    page,
  }) => {
    await page.route("**/api/admin/eval-runs", (route) =>
      route.fulfill({ contentType: "application/json", body: "[]" }),
    );
    await loginUi(page, ADMIN_TOKEN);
    await page.getByRole("tab", { name: "Evaluasi" }).click();
    await expect(page.getByTestId("eval-empty")).toContainText(
      "Belum ada run evaluasi",
    );

    const run = (id: string, cfg: string, recall: number, p95: number) => ({
      run_id: id,
      config: cfg,
      corpus_version: "v",
      models: {},
      metrics: {
        all: {
          n: 10,
          "recall@5": recall,
          mrr: recall - 0.1,
          latency_p95_ms: p95,
        },
      },
      created_at: "2026-11-14T10:00:00Z",
    });
    await page.unroute("**/api/admin/eval-runs");
    await page.route("**/api/admin/eval-runs", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          run("r_B1", "B1", 0.6, 900),
          run("r_M1", "M1", 0.8, 1500),
        ]),
      }),
    );
    await page.reload();
    await page.getByRole("tab", { name: "Evaluasi" }).click();
    await page.getByLabel("Bandingkan r_B1").check();
    await page.getByLabel("Bandingkan r_M1").check();
    const table = page.getByTestId("compare");
    await expect(table).toContainText("Recall@5");
    await expect(table.getByRole("row", { name: /Recall@5/ })).toContainText(
      "0.800",
    );
    await expect(table.getByRole("row", { name: /Latensi p95/ })).toContainText(
      "900",
    );
  });
});
