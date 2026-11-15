import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ADMIN_TOKEN, gotoSection, loginUi, REVIEW_TOKEN } from "./helpers";

const SECTIONS = [
  "Ringkasan",
  "Dokumen",
  "Dataset",
  "Uji pertanyaan",
  "Evaluasi",
  "Konfigurasi",
];
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Navigasi admin" });

const DOC = (
  id: string,
  lang: string,
  filePresent: boolean,
  chunks: number,
) => ({
  id,
  title: `Dokumen ${id}`,
  lang,
  file: filePresent ? `${id}.pdf` : null,
  file_present: filePresent,
  sha256: filePresent ? "abc123" : null,
  index: true,
  api_allowed: true,
  ingested: filePresent,
  chunks,
  status_berlaku: "belum diverifikasi",
  note: null,
  overridden: [],
  report: null,
});

function qaView(total: number, dev: number, test: number, frozen = false) {
  return {
    items: [],
    stats: {
      total,
      target_min: 60,
      by_split: { dev, test },
      by_type: { factual: total, multihop: 0, unanswerable: 0 },
      cross: {},
    },
    next_id: `q${String(total + 1).padStart(3, "0")}`,
    frozen: frozen
      ? { frozen_at: "2026-11-14T10:00:00Z", n_test: test, sha256: "x" }
      : null,
    integrity: frozen ? "ok" : "not_frozen",
  };
}

const CONFIG = (warnings: string[]) => ({
  configs: [],
  models: {
    llm_model: "vendor/gen",
    judge_model: "vendor/judge",
    embedding_provider: "openrouter",
    embedding_model: "baai/bge-m3",
    reranker_model: "r",
  },
  secrets_set: {
    openrouter_api_key: true,
    admin_token: true,
    review_token: true,
    jwt_secret: true,
  },
  limits: {
    daily_cost_limit_usd: 5,
    daily_cost_used_usd: 0.123,
    ask_rate_per_min: 20,
    login_rate_per_min: 5,
  },
  corpus: {
    versions: ["v1"],
    chunks: 126,
    documents_indexed: 3,
    embeddings: [{ model: "baai/bge-m3", count: 126 }],
  },
  prompts: { answer: "v1", judge: "v1" },
  tracing_enabled: false,
  warnings,
});

async function mockOverview(
  page: Page,
  opts: {
    qa: ReturnType<typeof qaView>;
    runs?: unknown[];
    warnings?: string[];
    docs?: ReturnType<typeof DOC>[];
  },
) {
  const json = (body: unknown) => ({
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/admin/documents", (r) =>
    r.fulfill(
      json(
        opts.docs ?? [
          DOC("D1", "id", true, 17),
          DOC("D2", "id", true, 92),
          DOC("D3", "id", false, 0),
        ],
      ),
    ),
  );
  await page.route("**/api/admin/qa", (r) => r.fulfill(json(opts.qa)));
  await page.route("**/api/admin/config", (r) =>
    r.fulfill(json(CONFIG(opts.warnings ?? []))),
  );
  await page.route("**/api/admin/eval-runs", (r) =>
    r.fulfill(json(opts.runs ?? [])),
  );
}

test.describe("kerangka admin (desktop)", () => {
  test("sidebar kiri dengan menu per halaman; header situs tidak ikut tampil", async ({
    page,
  }) => {
    await loginUi(page, ADMIN_TOKEN);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Ringkasan" }),
    ).toBeVisible();
    await expect(nav(page).getByRole("link")).toHaveCount(SECTIONS.length);
    await expect(
      nav(page).getByRole("link", { name: /^Ringkasan/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Cara kerja" })).toHaveCount(0); // site header hidden

    for (const name of SECTIONS.slice(1)) {
      await gotoSection(page, name);
      await expect(
        nav(page).getByRole("link", { name: new RegExp(`^${name}`) }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        nav(page).getByRole("link", { name: /^Ringkasan/ }),
      ).not.toHaveAttribute("aria-current", "page");
    }
    // each section has its own URL, so reload and Back keep the place
    await expect(page).toHaveURL(/\/admin\/konfigurasi$/);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Konfigurasi" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/evaluasi$/);
  });

  test("sidebar bisa diciutkan menjadi rel ikon dan pilihannya bertahan", async ({
    page,
  }) => {
    await loginUi(page, ADMIN_TOKEN);
    const aside = page.getByRole("complementary", { name: "Menu admin" });
    await expect(aside).toHaveAttribute("data-collapsed", "false");
    const wide = (await aside.boundingBox())!.width;
    await page.getByTestId("collapse-sidebar").click();
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    await expect
      .poll(async () => (await aside.boundingBox())!.width)
      .toBeLessThan(wide - 100);
    // labels stay available to assistive technology and as tooltips
    await expect(
      nav(page).getByRole("link", { name: /^Dataset/ }),
    ).toHaveAttribute("title", "Dataset");
    await page.reload();
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    await gotoSection(page, "Dataset");
    await page.getByTestId("collapse-sidebar").click();
    await expect(aside).toHaveAttribute("data-collapsed", "false");
  });

  test("lencana menu: kemajuan dataset dan jumlah peringatan konfigurasi", async ({
    page,
  }) => {
    await mockOverview(page, {
      qa: qaView(12, 8, 4),
      warnings: ["LLM belum dikonfigurasi."],
    });
    await loginUi(page, ADMIN_TOKEN);
    await expect(
      nav(page).getByRole("link", { name: /^Dataset/ }),
    ).toContainText("12/60");
    await expect(
      nav(page).getByRole("link", { name: /^Dataset/ }),
    ).toContainText("12 dari 60 pertanyaan");
    await expect(
      nav(page).getByRole("link", { name: /^Konfigurasi/ }),
    ).toContainText("1 peringatan konfigurasi");
  });

  test("keluar dari sidebar mengembalikan ke halaman masuk", async ({
    page,
  }) => {
    await loginUi(page, ADMIN_TOKEN);
    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/masuk/);
    await page.goto("/admin/dataset");
    await expect(page).toHaveURL(/\/masuk\?next=%2Fadmin%2Fdataset/);
  });

  test("rute admin dilindungi: tamu dan penilai diarahkan ke masuk", async ({
    page,
  }) => {
    await page.goto("/admin/dokumen");
    await expect(page).toHaveURL(/\/masuk\?next=%2Fadmin%2Fdokumen/);
    await loginUi(page, REVIEW_TOKEN, "Dr. Budi");
    await page.goto("/admin/uji");
    await expect(page).toHaveURL(/\/masuk\?next=%2Fadmin%2Fuji/);
  });
});

test.describe("ringkasan", () => {
  test("daftar kesiapan mencerminkan keadaan nyata dan menunjuk langkah berikutnya", async ({
    page,
  }) => {
    await mockOverview(page, { qa: qaView(12, 8, 4) });
    await loginUi(page, ADMIN_TOKEN);
    const ready = page.getByTestId("readiness");
    await expect(ready).toBeVisible();
    await expect(page.getByTestId("step-korpus")).toHaveAttribute(
      "data-state",
      "done",
    );
    await expect(page.getByTestId("step-llm")).toHaveAttribute(
      "data-state",
      "done",
    );
    await expect(page.getByTestId("step-dataset")).toHaveAttribute(
      "data-state",
      "todo",
    );
    await expect(page.getByTestId("step-dataset")).toContainText(
      "12 dari 60 pertanyaan tertulis",
    );
    await expect(page.getByTestId("step-split")).toHaveAttribute(
      "data-state",
      "done",
    );
    await expect(page.getByTestId("step-freeze")).toHaveAttribute(
      "data-state",
      "todo",
    );
    await expect(page.getByTestId("step-baseline")).toHaveAttribute(
      "data-state",
      "todo",
    );
    await expect(page.getByTestId("step-english")).toHaveCount(0); // corpus is Indonesian-only
    await expect(page.getByTestId("readiness-count")).toHaveText(
      "3 dari 7 langkah wajib selesai",
    );
    await expect(
      page.getByRole("progressbar", { name: "Kesiapan evaluasi final" }),
    ).toHaveAttribute("aria-valuenow", "3");
    await expect(
      page.getByRole("link", {
        name: /Berikutnya: dataset minimal 60 pertanyaan/,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("no-runs")).toBeVisible();
    await expect(page.getByTestId("overview-figures")).toContainText(
      "Dokumen diindeks",
    );
    await expect(page.getByTestId("overview-figures")).toContainText("$0.123");

    await page
      .getByTestId("step-dataset")
      .getByRole("link", { name: "Tulis pertanyaan" })
      .click();
    await expect(page).toHaveURL(/\/admin\/dataset$/);
  });

  test("semua langkah selesai: ringkasan menampilkan run terbaru", async ({
    page,
  }) => {
    const run = (id: string, cfg: string, m: Record<string, number>) => ({
      run_id: id,
      config: cfg,
      corpus_version: "v",
      models: {},
      metrics: { all: { n: 60, ...m } },
      created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    await mockOverview(page, {
      qa: qaView(64, 40, 24, true),
      runs: [
        run("a_M1_dev_gen", "M1", {
          faithfulness: 0.91,
          citation_correctness: 0.88,
        }),
        run("b_B1_dev", "B1", { "recall@5": 0.7, mrr: 0.5 }),
      ],
      docs: [
        DOC("D1", "id", true, 17),
        DOC("D2", "id", true, 92),
        DOC("D3", "id", true, 40),
      ],
    });
    await loginUi(page, ADMIN_TOKEN);
    await expect(page.getByTestId("readiness-count")).toHaveText(
      "7 dari 7 langkah wajib selesai",
    );
    await expect(page.getByRole("link", { name: /Berikutnya:/ })).toHaveCount(
      0,
    );
    const aside = page.getByRole("complementary", { name: /Run terbaru/ });
    await expect(aside).toContainText("M1");
    await expect(aside).toContainText("faithfulness 0.91");
    await expect(aside).toContainText("Recall@5 0.70");
    await expect(aside).toContainText("5 menit yang lalu");
  });

  test("galat API ditampilkan jelas, bukan layar kosong", async ({ page }) => {
    await page.route("**/api/admin/qa", (r) =>
      r.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await loginUi(page, ADMIN_TOKEN);
    await expect(
      page.locator('[role="alert"]:not(#__next-route-announcer__)'),
    ).toContainText("Ringkasan belum dapat dimuat");
  });
});

test.describe("kerangka admin (ponsel)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("menu menjadi laci: buka, pilih halaman menutup laci, Esc menutup", async ({
    page,
  }) => {
    await loginUi(page, ADMIN_TOKEN);
    await expect(
      page.getByRole("complementary", { name: "Menu admin" }),
    ).toBeHidden();
    await page.getByTestId("open-drawer").click();
    const drawer = page.getByTestId("admin-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: /^Dataset/ })).toBeVisible();
    await drawer.getByRole("link", { name: /^Dataset/ }).click();
    await expect(page).toHaveURL(/\/admin\/dataset$/);
    await expect(drawer).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Dataset" }),
    ).toBeVisible();

    await page.getByTestId("open-drawer").click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("ringkasan terbaca di layar sempit tanpa gulir horizontal", async ({
    page,
  }) => {
    await mockOverview(page, { qa: qaView(3, 2, 1) });
    await loginUi(page, ADMIN_TOKEN);
    await expect(page.getByTestId("readiness")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`aksesibilitas kerangka admin, tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockOverview(page, {
      qa: qaView(12, 8, 4),
      warnings: ["LLM belum dikonfigurasi."],
    });
    await loginUi(page, ADMIN_TOKEN);
    await expect(page.getByTestId("readiness")).toBeVisible();
    const check = async (label: string) => {
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        r.violations.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
        ),
        label,
      ).toEqual([]);
    };
    await check(`ringkasan ${scheme}`);
    await page.getByTestId("collapse-sidebar").click();
    await check(`sidebar ciut ${scheme}`);
    await page.getByTestId("collapse-sidebar").click();
  });
}
