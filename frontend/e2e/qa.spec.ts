import { expect, test } from "@playwright/test";

import {
  answerEvents,
  appAlert,
  CITATION,
  expectPdfRendered,
  DONE,
  mockAsk,
  openAnswer,
  sseBody,
} from "./helpers";

test.describe("beranda", () => {
  test("pesan tunggal, contoh pertanyaan, korpus nyata, dan navigasi ke jawaban", async ({
    page,
  }) => {
    await mockAsk(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Tanya aturan K3 listrik, lengkap dengan pasalnya",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Dijawab hanya dari dokumen resmi"),
    ).toBeVisible();
    await expect(
      page.getByText("Bukan pengganti petugas K3. Selalu cek pasal sumber."),
    ).toBeVisible();
    // corpus chips come from the real /api/documents
    await expect(page.getByText("Permen ESDM No. 10 Tahun 2021")).toBeVisible();

    await page
      .getByLabel("Pertanyaan Anda")
      .fill("Siapa yang wajib memiliki sertifikat?");
    await page.getByRole("button", { name: "Agentik" }).click();
    await page.getByRole("button", { name: /^Tanya/ }).click();
    await expect(page).toHaveURL(/\/tanya\?q=.*&mode=agentic/);
  });

  test("tombol Tanya nonaktif untuk pertanyaan terlalu pendek; contoh bisa diklik", async ({
    page,
  }) => {
    await mockAsk(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Tanya/ })).toBeDisabled();
    await page
      .getByRole("button", {
        name: "Siapa yang wajib memiliki sertifikat kompetensi?",
      })
      .click();
    await expect(page).toHaveURL(/\/tanya\?q=Siapa/);
  });
});

test.describe("jawaban dan sumber", () => {
  test("klik sitasi membuka panel dengan teks pasal, PDF di halaman yang benar, dan sorotan", async ({
    page,
  }) => {
    await openAnswer(page);
    await expect(page.getByTestId("confidence-badge")).toHaveText(
      /Didukung sumber/,
    );
    await expect(page.getByTestId("answer")).toContainText(
      "sertifikat laik operasi",
    );
    await expect(page.getByTestId("source-1")).toContainText("Pasal 18");

    await page.getByTestId("cite-1").click();
    await expect(page.getByTestId("cite-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const panel = page.getByTestId("source-panel");
    await expect(panel).toContainText("Sumber 1");
    await expect(panel).toContainText("sertifikat laik operasi"); // chunk text from the real DB
    await expect(panel).toContainText("halaman 14");
    // real PDF.js render + highlight overlay from the stored bbox
    await expect(panel.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expectPdfRendered(panel);
    await expect(panel.getByTestId("pdf-highlight").first()).toBeVisible();
    await expect(panel.getByText(/Halaman 14 dari \d+/)).toBeVisible();

    // page navigation keeps working
    await panel.getByRole("button", { name: "Halaman berikutnya" }).click();
    await expect(panel.getByText(/Halaman 15 dari/)).toBeVisible();
  });

  test("tombol 'Buka di PDF' pada kartu sumber juga membuka panel", async ({
    page,
  }) => {
    await openAnswer(page);
    await page
      .getByTestId("source-1")
      .getByRole("button", { name: /Buka di PDF/ })
      .click();
    await expect(page.getByTestId("source-panel")).toContainText("Pasal 18");
  });

  test("abstain tampil sebagai jawaban yang jelas, bukan galat", async ({
    page,
  }) => {
    await mockAsk(page, [
      [
        "token",
        {
          text: "Informasi tersebut tidak ditemukan dalam dokumen yang tersedia.",
        },
      ],
      ["citations", []],
      [
        "done",
        {
          ...DONE,
          abstained: true,
          abstain_reason: "insufficient_context",
          confidence: 0,
          badge: "not_found",
        },
      ],
    ]);
    await page.goto("/tanya?q=Berapa%20harga%20tiket%20pesawat&mode=standard");
    await expect(page.getByTestId("confidence-badge")).toHaveText(
      /Tidak ditemukan di dokumen/,
    );
    await expect(page.getByText(/memilih tidak menjawab/)).toBeVisible();
    await expect(appAlert(page)).toHaveCount(0);
  });

  test("mode agentik menampilkan langkah pencarian yang bisa dilipat", async ({
    page,
  }) => {
    await mockAsk(page, [
      [
        "agent_steps",
        {
          tool: "search_regulations",
          args: { query: "sertifikat laik operasi" },
          found: ["D2-P18"],
          summary: "Pasal 18",
        },
      ],
      [
        "agent_steps",
        {
          tool: "get_chunk",
          args: { chunk_id: "D2-P18" },
          found: ["D2-P18"],
          summary: "Pasal 18",
        },
      ],
      ...answerEvents(),
    ]);
    await page.goto(
      "/tanya?q=Kapan%20instalasi%20boleh%20dioperasikan&mode=agentic",
    );
    const trigger = page.getByRole("button", {
      name: /Langkah pencarian \(2\)/,
    });
    await expect(trigger).toBeVisible();
    await expect(page.getByTestId("agent-steps")).toContainText(
      "Mencari: “sertifikat laik operasi”",
    );
    await trigger.click(); // collapse
    await expect(page.getByTestId("agent-steps")).toBeHidden();
  });

  test("galat 429 menjelaskan langkah berikutnya dan bisa dicoba lagi", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/ask", (route) => {
      calls += 1;
      if (calls === 1) {
        return route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "Terlalu banyak permintaan. Coba lagi sebentar lagi.",
          }),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sseBody(answerEvents()),
      });
    });
    await page.goto("/tanya?q=Pertanyaan%20uji%20galat&mode=standard");
    const alert = appAlert(page);
    await expect(alert).toContainText("Terlalu banyak permintaan");
    await expect(alert).toContainText("Tunggu sebentar");
    await alert.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.getByTestId("confidence-badge")).toBeVisible();
  });

  test("jempol + komentar mengirim umpan balik; riwayat sesi menyimpan pertanyaan", async ({
    page,
  }) => {
    await openAnswer(page, "Pertanyaan riwayat satu");
    let body = "";
    await page.route("**/api/feedback", (route) => {
      body = route.request().postData() ?? "";
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: '{"status":"ok"}',
      });
    });
    await page.getByRole("button", { name: "Membantu", exact: true }).click();
    await page.getByLabel("Komentar (opsional)").fill("Sangat jelas");
    await page.getByRole("button", { name: "Kirim umpan balik" }).click();
    await expect(
      page.getByText("Terima kasih atas umpan balik Anda."),
    ).toBeVisible();
    expect(JSON.parse(body)).toMatchObject({
      query_id: DONE.query_id,
      thumbs: 1,
      comment: "Sangat jelas",
    });

    // second question -> history lists both
    await page.getByLabel("Pertanyaan Anda").fill("Pertanyaan riwayat dua");
    await page.getByRole("button", { name: /^Tanya/ }).click();
    await expect(page.getByTestId("confidence-badge")).toBeVisible();
    await page.getByText(/Riwayat sesi \(2\)/).click();
    await expect(
      page.getByRole("button", { name: "Pertanyaan riwayat satu" }),
    ).toBeVisible();
  });

  test("sitasi tanpa sumber terkait tidak menjadi tombol", async ({ page }) => {
    await mockAsk(page, [
      ["token", { text: "Jawaban dengan rujukan [1] dan [7]." }],
      ["citations", [CITATION]],
      ["done", DONE],
    ]);
    await page.goto("/tanya?q=Uji%20rujukan%20tak%20dikenal&mode=standard");
    await expect(page.getByTestId("cite-1")).toBeVisible();
    await expect(page.getByTestId("cite-7")).toHaveCount(0);
  });
});

test.describe("ponsel", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("sumber terbuka sebagai bottom sheet dan bisa ditutup dengan Esc", async ({
    page,
  }) => {
    await openAnswer(page);
    await page.getByTestId("cite-1").click();
    const sheet = page.getByTestId("bottom-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("sertifikat laik operasi");
    await expect(sheet.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expectPdfRendered(sheet);
    // no horizontal page scroll at phone width
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });
});
