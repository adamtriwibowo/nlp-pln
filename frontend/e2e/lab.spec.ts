import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ADMIN_TOKEN, loginUi } from "./helpers";

// One serial flow: the dataset created in the first test is used by the later ones. The API runs
// with EVAL_DIR pointing at a temp directory, so the real data/eval/qa.jsonl is never touched.
test.describe.configure({ mode: "serial" });

const CANDIDATES = [
  {
    rank: 1,
    chunk_id: "D2-P18",
    ref: "Pasal 18",
    doc_title: "Permen ESDM 10/2021",
    page_start: 14,
    score: 0.03,
    snippet:
      "(1) Pengoperasian Instalasi Tenaga Listrik ... dilakukan setelah memiliki sertifikat laik operasi.",
  },
  {
    rank: 2,
    chunk_id: "D2-P22",
    ref: "Pasal 22",
    doc_title: "Permen ESDM 10/2021",
    page_start: 16,
    score: 0.02,
    snippet: "(1) Pemeliharaan Instalasi Tenaga Listrik ...",
  },
];

async function openAdminTab(page: Page, tab: string) {
  await loginUi(page, ADMIN_TOKEN);
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole("tab", { name: tab }).click();
}

async function fillForm(
  page: Page,
  id: string,
  split: "dev" | "test",
  question: string,
) {
  await page.getByTestId("add-qa").click();
  const form = page.getByTestId("qa-form");
  await expect(form).toBeVisible();
  await form.getByLabel("ID", { exact: true }).fill(id);
  await form.getByLabel("Split").selectOption(split);
  await form.getByLabel("Pertanyaan", { exact: true }).fill(question);
  await form
    .getByLabel("Jawaban acuan")
    .fill(
      "Instalasi baru boleh dioperasikan setelah memiliki sertifikat laik operasi.",
    );
  await form.getByLabel("Catatan sumber").fill("Permen ESDM 10/2021 Pasal 18");
  return form;
}

async function axeClean(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    ),
    `${label}: axe`,
  ).toEqual([]);
}

test("dataset: keadaan kosong, tambah dengan kandidat, validasi server, ubah dan hapus", async ({
  page,
}) => {
  await page.route("**/api/admin/qa/candidates*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(CANDIDATES),
    }),
  );
  await openAdminTab(page, "Dataset");
  await expect(page.getByTestId("qa-empty")).toBeVisible();
  await expect(page.getByTestId("qa-total")).toContainText(
    "0 dari target minimal 60",
  );

  // add q001 with a gold chunk chosen from the candidate list
  const form = await fillForm(
    page,
    "q001",
    "dev",
    "Kapan instalasi tenaga listrik boleh dioperasikan?",
  );
  await form.getByRole("button", { name: "Cari kandidat" }).click();
  await expect(page.getByTestId("candidates")).toContainText("D2-P18");
  await page
    .getByTestId("candidates")
    .getByRole("button", { name: "Jadikan gold" })
    .first()
    .click();
  await expect(page.getByTestId("gold-list")).toContainText("D2-P18");
  await expect(
    page.getByTestId("candidates").getByRole("button", { name: "Dipilih" }),
  ).toBeDisabled();
  await axeClean(page, "dataset form");
  await page.getByTestId("save-qa").click();

  const row = page.getByTestId("qa-row-q001");
  await expect(row).toContainText(
    "Kapan instalasi tenaga listrik boleh dioperasikan?",
  );
  await expect(page.getByTestId("qa-total")).toContainText(
    "1 dari target minimal 60",
  );

  // the real server rejects a gold id that does not exist in the corpus
  const bad = await fillForm(
    page,
    "q002",
    "dev",
    "Pertanyaan dengan gold yang tidak ada?",
  );
  await bad.getByLabel("Atau ketik chunk_id").fill("D9-P99");
  await bad.getByRole("button", { name: "Tambah chunk_id" }).click();
  await page.getByTestId("save-qa").click();
  await expect(page.getByTestId("qa-error")).toContainText("D9-P99");
  await page.getByRole("button", { name: "Hapus gold D9-P99" }).click();
  await bad.getByLabel("Atau ketik chunk_id").fill("D2-P35");
  await bad.getByRole("button", { name: "Tambah chunk_id" }).click();
  await page.getByTestId("save-qa").click();
  await expect(page.getByTestId("qa-row-q002")).toBeVisible();

  // edit
  await page.getByRole("button", { name: "Ubah q002" }).click();
  await page
    .getByTestId("qa-form")
    .getByLabel("Pertanyaan", { exact: true })
    .fill("Siapa yang bertanggung jawab atas SMK2?");
  await page.getByTestId("save-qa").click();
  await expect(page.getByTestId("qa-row-q002")).toContainText(
    "Siapa yang bertanggung jawab atas SMK2?",
  );

  // an unanswerable item has no gold chunks
  const un = await fillForm(
    page,
    "q003",
    "dev",
    "Berapa harga tiket pesawat ke Bali?",
  );
  await un.getByLabel("Tipe").selectOption("unanswerable");
  await expect(un).toContainText("tidak memiliki chunk gold");
  await page.getByTestId("save-qa").click();
  await expect(page.getByTestId("qa-row-q003")).toContainText("Di luar korpus");
  await expect(page.getByTestId("dataset-stats")).toContainText("Dev");

  // delete
  await page.getByRole("button", { name: "Hapus q003" }).click();
  await expect(page.getByTestId("qa-row-q003")).toHaveCount(0);
});

test("dataset: split test bisa dibekukan, lalu terkunci; dev tetap bisa diubah", async ({
  page,
}) => {
  await openAdminTab(page, "Dataset");
  const form = await fillForm(
    page,
    "q010",
    "test",
    "Apa kewajiban pemilik instalasi terhadap SMK2?",
  );
  await form.getByLabel("Atau ketik chunk_id").fill("D2-P35");
  await form.getByRole("button", { name: "Tambah chunk_id" }).click();
  await page.getByTestId("save-qa").click();
  await expect(page.getByTestId("qa-row-q010")).toContainText("test");

  await page.getByTestId("freeze").click();
  await expect(
    page.getByRole("group", { name: "Konfirmasi pembekuan" }),
  ).toContainText("Bekukan 1 item test");
  await page.getByTestId("freeze-confirm").click();
  const banner = page.getByTestId("freeze-banner");
  await expect(banner).toContainText("dibekukan");
  await expect(banner).toHaveAttribute("data-integrity", "ok");

  // locked: edit/delete disabled for the test item, new test items refused by the server
  await expect(page.getByRole("button", { name: "Ubah q010" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Hapus q010" })).toBeDisabled();
  const again = await fillForm(
    page,
    "q011",
    "test",
    "Pertanyaan test tambahan setelah beku?",
  );
  await again.getByLabel("Atau ketik chunk_id").fill("D2-P35");
  await again.getByRole("button", { name: "Tambah chunk_id" }).click();
  await expect(
    page.getByText("item test tidak dapat ditambah atau diubah"),
  ).toBeVisible();
  await expect(page.getByTestId("save-qa")).toBeDisabled();
  await again.getByLabel("Split").selectOption("dev");
  await page.getByTestId("save-qa").click();
  await expect(page.getByTestId("qa-row-q011")).toContainText("dev");

  // filters
  await page.getByLabel("Split", { exact: true }).first().selectOption("test");
  await expect(page.getByTestId("qa-row-q010")).toBeVisible();
  await expect(page.getByTestId("qa-row-q001")).toHaveCount(0);
});

test("uji pertanyaan (retrieval nyata, tanpa LLM): peringkat dan gold", async ({
  page,
}) => {
  await openAdminTab(page, "Uji pertanyaan");
  await page
    .getByLabel("Ambil dari dataset (opsional)")
    .selectOption({ index: 1 });
  await expect(page.getByLabel("Pertanyaan", { exact: true })).not.toHaveValue(
    "",
  );
  await page
    .getByLabel("Pertanyaan", { exact: true })
    .fill("sertifikat laik operasi sebelum instalasi dioperasikan");
  await page.getByLabel(/Chunk gold/).fill("D2-P18, D2-P99");
  await page.getByRole("combobox", { name: "Konfigurasi" }).selectOption("B1");
  await expect(page.getByLabel("Sertakan jawaban LLM")).not.toBeChecked();
  await page.getByTestId("run-playground").click();

  const result = page.getByTestId("playground-result");
  await expect(result).toBeVisible();
  await expect(page.getByTestId("gold-summary")).toContainText(
    "Gold ditemukan",
  );
  await expect(page.getByTestId("gold-summary")).toContainText(
    "D2-P99: tidak ditemukan",
  );
  await expect(page.getByTestId("rank-1")).toBeVisible();
  await expect(
    page.getByTestId("ranking").locator('tr[data-gold="true"]').first(),
  ).toContainText("D2-P18");
  await expect(result).toContainText("LLM tidak dipanggil");
  await axeClean(page, "playground");
});

test("uji pertanyaan: B0 dan M3 mewajibkan LLM; sitasi yang gagal diverifikasi ditandai", async ({
  page,
}) => {
  await page.route("**/api/admin/playground", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        question: "Pertanyaan uji sitasi",
        config: "M1",
        generated: true,
        retrieval_ms: 12,
        ranking: [],
        gold: null,
        answer: {
          answer: "Jawaban uji [1][2].",
          abstained: false,
          confidence: 0.9,
          abstain_reason: "",
          audit_removed: [],
          citations: [
            {
              label: 1,
              chunk_id: "D2-P18",
              quote: "kutipan benar",
              ref: "Pasal 18",
              in_context: true,
              quote_verified: true,
              is_gold: true,
            },
            {
              label: 2,
              chunk_id: "D2-P18",
              quote: "kutipan karangan",
              ref: "Pasal 18",
              in_context: true,
              quote_verified: false,
              is_gold: false,
            },
            {
              label: 3,
              chunk_id: "D9-P1",
              quote: "di luar konteks",
              ref: "D9-P1",
              in_context: false,
              quote_verified: false,
              is_gold: false,
            },
          ],
        },
        steps: [],
        usage: {
          model: "vendor/model",
          input_tokens: 100,
          output_tokens: 20,
          cost_usd: 0.0007,
          latency_ms: 800,
        },
      }),
    }),
  );
  await openAdminTab(page, "Uji pertanyaan");
  await page.getByRole("combobox", { name: "Konfigurasi" }).selectOption("B0");
  const llm = page.getByLabel("Sertakan jawaban LLM");
  await expect(llm).toBeChecked();
  await expect(llm).toBeDisabled();
  await page.getByRole("combobox", { name: "Konfigurasi" }).selectOption("M1");
  await expect(llm).toBeEnabled();
  await llm.check();
  await page
    .getByLabel("Pertanyaan", { exact: true })
    .fill("Pertanyaan uji sitasi");
  await page.getByTestId("run-playground").click();
  const cites = page.getByTestId("pg-citations").locator("li");
  await expect(cites).toHaveCount(3);
  await expect(cites.nth(0)).toHaveAttribute("data-ok", "true");
  await expect(cites.nth(1)).toContainText("TIDAK ditemukan di teks chunk");
  await expect(cites.nth(2)).toContainText("TIDAK ada di konteks");
  await expect(page.getByTestId("pg-usage")).toContainText("$0.00070");
  await axeClean(page, "playground answer");
});

test("uji pertanyaan: galat server ditampilkan jelas", async ({ page }) => {
  await page.route("**/api/admin/playground", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail:
          "Layanan LLM belum dikonfigurasi (LLM_MODEL / OPENROUTER_API_KEY).",
      }),
    }),
  );
  await openAdminTab(page, "Uji pertanyaan");
  await page
    .getByLabel("Pertanyaan", { exact: true })
    .fill("Pertanyaan yang gagal");
  await page.getByTestId("run-playground").click();
  await expect(page.getByTestId("playground-error")).toContainText(
    "LLM belum dikonfigurasi",
  );
});

test("konfigurasi: baca-saja, tanpa rahasia, dan jalankan evaluasi dev dengan konfirmasi biaya", async ({
  page,
}) => {
  await openAdminTab(page, "Konfigurasi");
  await expect(page.getByText("Tampilan baca-saja")).toBeVisible();
  await expect(page.getByTestId("configs").locator("tbody tr")).toHaveCount(6);
  await expect(page.getByTestId("secrets")).toContainText("admin_token terisi");
  await expect(page.locator("body")).not.toContainText(ADMIN_TOKEN);
  await expect(
    page.getByRole("progressbar", { name: "Pemakaian biaya harian" }),
  ).toBeVisible();
  await axeClean(page, "config");

  // retrieval estimate is real (dataset from the earlier test has dev questions)
  await page.getByRole("combobox", { name: "Konfigurasi" }).selectOption("B1");
  await page.getByTestId("estimate-eval").click();
  await expect(page.getByTestId("estimate-box")).toContainText("pertanyaan");
  await expect(page.getByTestId("estimate-box")).toContainText("$0.0000");

  // starting is mocked (a real run would write runs/ and eval tables)
  let started = 0;
  let polls = 0;
  await page.route("**/api/admin/evals", (route) => {
    started += 1;
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        id: "ev1",
        status: "running",
        log: [],
        error: null,
        started_at: "t",
        finished_at: null,
      }),
    });
  });
  await page.route("**/api/admin/jobs/ev1", (route) => {
    polls += 1;
    const done = polls >= 2;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "ev1",
        status: done ? "done" : "running",
        log: done
          ? ["Selesai: Recall@5=0.800 MRR=0.700 (n=2)."]
          : ["Menjalankan retrieval B1..."],
        error: null,
        started_at: "t",
        finished_at: done ? "t2" : null,
      }),
    });
  });
  await page.getByTestId("start-eval").click();
  await expect(page.getByTestId("eval-job-status")).toHaveText("Selesai", {
    timeout: 20_000,
  });
  await expect(page.getByText("Recall@5=0.800")).toBeVisible();
  expect(started).toBe(1);
});

test("konfigurasi: perkiraan biaya yang melewati batas harian ditolak dengan pesan jelas", async ({
  page,
}) => {
  await page.route("**/api/admin/evals/estimate", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Perkiraan biaya $0.2 melebihi sisa batas harian ($0.05).",
      }),
    }),
  );
  await openAdminTab(page, "Konfigurasi");
  await page.getByLabel("Jenis").selectOption("generation");
  await page.getByTestId("estimate-eval").click();
  await expect(page.getByTestId("estimate-error")).toContainText(
    "melebihi sisa batas harian",
  );
  await expect(page.getByTestId("start-eval")).toHaveCount(0);
});

test("evaluasi dev hanya untuk split dev: server menolak split test", async ({
  request,
}) => {
  // the API is called directly (not through the UI, which never offers the test split)
  const login = await request.post("/api/auth/login", {
    data: { token: ADMIN_TOKEN },
  });
  expect(login.ok()).toBeTruthy();
  const r = await request.post("/api/admin/evals", {
    data: { config_id: "B1", kind: "retrieval", split: "test" },
  });
  expect(r.status()).toBe(422);
  expect((await r.json()).detail).toContain("dibekukan");
});

for (const scheme of ["light", "dark"] as const) {
  test(`aksesibilitas tab admin baru, tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openAdminTab(page, "Dataset");
    await expect(page.getByTestId("dataset-stats")).toBeVisible();
    await axeClean(page, `dataset ${scheme}`);
    await page.getByRole("tab", { name: "Konfigurasi" }).click();
    await expect(page.getByTestId("configs")).toBeVisible();
    await axeClean(page, `konfigurasi ${scheme}`);
    await page.getByRole("tab", { name: "Uji pertanyaan" }).click();
    await axeClean(page, `uji ${scheme}`);
  });
}
