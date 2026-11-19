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
    await expect(page.getByTestId("chat-sidebar")).toBeVisible();
    await expect(page.getByTestId("new-chat")).toBeVisible();
    await expect(
      page.getByText("Bukan pengganti petugas K3. Selalu cek pasal sumber."),
    ).toBeVisible();

    await page
      .getByLabel("Pertanyaan Anda")
      .fill("Siapa yang wajib memiliki sertifikat?");
    await page.getByRole("button", { name: "Agentik" }).click();
    await page.getByRole("button", { name: /^Tanya/ }).click();
    await expect(page).toHaveURL(/\/\?c=/);
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
    // the example only fills (and focuses) the box so it can be edited first
    const box = page.getByLabel("Pertanyaan Anda");
    await expect(box).toHaveValue(
      "Siapa yang wajib memiliki sertifikat kompetensi?",
    );
    await expect(box).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
    await box.press("Enter");
    await expect(page).toHaveURL(/\/\?c=/);
  });

  test("Shift+Enter menambah baris, Enter mengirim, petunjuk muncul untuk teks pendek", async ({
    page,
  }) => {
    await mockAsk(page);
    await page.goto("/");
    const box = page.getByLabel("Pertanyaan Anda");
    await box.fill("ab");
    await expect(
      page.getByText("Tambahkan sedikit detail agar pasalnya tepat."),
    ).toBeVisible();
    await box.press("Enter"); // too short: nothing is sent
    await expect(page).toHaveURL(/\/$/);
    await box.fill("Apa kewajiban pemilik instalasi?");
    await box.press("Shift+Enter");
    await expect(box).toHaveValue("Apa kewajiban pemilik instalasi?\n");
    await expect(page).toHaveURL(/\/$/);
    await box.press("Enter");
    await expect(page).toHaveURL(/\/\?c=/);
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

  test("panel sumber bisa diubah lebarnya (seret/keyboard) dan PDF bisa diperbesar", async ({
    page,
  }) => {
    await openAnswer(page);
    await page.getByTestId("cite-1").click();
    const aside = page.getByRole("complementary", { name: "Panel sumber" });
    const panel = page.getByTestId("source-panel");
    await expect(panel.locator("canvas")).toBeVisible({ timeout: 30_000 });
    const widthOf = async () => (await aside.boundingBox())!.width;
    const before = await widthOf();

    // keyboard: Left widens, Right narrows, Home goes to the minimum
    const splitter = page.getByRole("separator", {
      name: "Ubah lebar panel sumber",
    });
    await splitter.focus();
    await splitter.press("ArrowLeft");
    await splitter.press("ArrowLeft");
    expect(await widthOf()).toBeGreaterThan(before);
    await splitter.press("Home");
    expect(await widthOf()).toBeLessThan(before);

    // drag with the mouse
    const box = (await splitter.boundingBox())!;
    const narrow = await widthOf();
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x - 150, box.y + 200, { steps: 5 });
    await page.mouse.up();
    expect(await widthOf()).toBeGreaterThan(narrow + 100);

    // the chosen width is remembered after a reload
    const chosen = await widthOf();
    await page.reload();
    await page.getByTestId("chat-item").first().click();
    await page.getByTestId("cite-1").click();
    expect(Math.abs((await widthOf()) - chosen)).toBeLessThan(2);

    // zoom: the page canvas grows and the frame scrolls instead of the panel
    const canvas = page.getByTestId("source-panel").locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const w1 = (await canvas.boundingBox())!.width;
    await page.getByRole("button", { name: "Perbesar", exact: true }).click();
    await expect(page.getByTestId("pdf-zoom")).toHaveText("125%");
    await expect
      .poll(async () => (await canvas.boundingBox())!.width)
      .toBeGreaterThan(w1 * 1.1);
    await page.getByTestId("pdf-zoom").click();
    await expect(page.getByTestId("pdf-zoom")).toHaveText("100%");
  });

  test("salin jawaban menyertakan sumber sebagai teks biasa", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openAnswer(page);
    await page.getByTestId("copy-answer").click();
    await expect(page.getByTestId("copy-answer")).toContainText("Tersalin");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("sertifikat laik operasi");
    expect(copied).toContain("Sumber:");
    expect(copied).toContain("[1] Pasal 18");
    expect(copied).toContain("hlm. 14");
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
    // a finished answer keeps its steps collapsed; open them to see the search trail
    await expect(page.getByTestId("agent-steps")).toBeHidden();
    await trigger.click();
    await expect(page.getByTestId("agent-steps")).toContainText(
      "Mencari: “sertifikat laik operasi”",
    );
    await trigger.click();
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

    // second question stays in the same conversation (one sidebar entry, two exchanges)
    await page.getByLabel("Pertanyaan Anda").fill("Pertanyaan riwayat dua");
    await page.getByRole("button", { name: /^Tanya/ }).click();
    await expect(page.getByTestId("user-message")).toHaveText([
      "Pertanyaan riwayat satu",
      "Pertanyaan riwayat dua",
    ]);
    await expect(page.getByTestId("confidence-badge")).toHaveCount(2);
    await expect(page.getByTestId("chat-item")).toHaveCount(1);
    await expect(page.getByTestId("chat-item")).toHaveText(
      "Pertanyaan riwayat satu",
    );
  });

  test("percakapan tersimpan di browser: dibuka lagi dari sidebar, percakapan baru, dan dihapus", async ({
    page,
  }) => {
    await openAnswer(page, "Pertanyaan tersimpan A");
    await page.getByTestId("new-chat").click();
    await expect(
      page.getByRole("heading", { level: 1, name: /Tanya aturan K3 listrik/ }),
    ).toBeVisible();
    await page.getByLabel("Pertanyaan Anda").fill("Pertanyaan tersimpan B");
    await page.getByRole("button", { name: /^Tanya/ }).click();
    await expect(page.getByTestId("user-message")).toHaveText([
      "Pertanyaan tersimpan B",
    ]);
    await expect(page.getByTestId("chat-item")).toHaveCount(2);

    // survives a reload (localStorage) and reopens the older conversation
    await page.goto("/");
    await expect(page.getByTestId("chat-item")).toHaveCount(2);
    await page
      .getByTestId("chat-item")
      .filter({ hasText: "tersimpan A" })
      .click();
    await expect(page.getByTestId("user-message")).toHaveText([
      "Pertanyaan tersimpan A",
    ]);
    await expect(page.getByTestId("confidence-badge")).toBeVisible();

    // delete the open conversation: back to the empty chat
    await page
      .getByRole("button", { name: /Hapus percakapan: Pertanyaan tersimpan A/ })
      .click();
    await expect(page.getByTestId("chat-item")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { level: 1, name: /Tanya aturan K3 listrik/ }),
    ).toBeVisible();
  });

  test("halaman /tentang menampilkan cara kerja dan korpus nyata", async ({
    page,
  }) => {
    await page.goto("/tentang");
    await expect(
      page.getByRole("heading", { name: /dalam empat langkah/ }),
    ).toBeVisible();
    await expect(page.getByText("Permen ESDM No. 10 Tahun 2021")).toBeVisible();
    await page.getByRole("link", { name: /Mulai bertanya/ }).click();
    await expect(page.getByTestId("new-chat")).toBeVisible();
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

  test("layar sambutan dimulai dari atas: judul terlihat penuh", async ({
    page,
  }) => {
    await page.goto("/");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeInViewport({ ratio: 1 });
    await expect(page.getByLabel("Pertanyaan Anda")).toBeInViewport();
  });

  test("menu percakapan terbuka sebagai laci dan riwayat bisa dibuka", async ({
    page,
  }) => {
    await openAnswer(page, "Pertanyaan laci ponsel");
    await expect(page.getByTestId("chat-sidebar")).toBeHidden();
    await page.getByTestId("open-chat-menu").click();
    const drawer = page.getByTestId("chat-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("chat-item")).toHaveText([
      "Pertanyaan laci ponsel",
    ]);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

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
