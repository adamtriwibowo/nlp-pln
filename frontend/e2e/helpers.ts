import { expect, type Locator, type Page } from "@playwright/test";

export const ADMIN_TOKEN = "e2e-admin-token";
export const REVIEW_TOKEN = "e2e-review-token";

/** Serialize events the way the API does ("event: x\ndata: {...}\n\n"). */
export function sseBody(events: [string, unknown][]): string {
  return events
    .map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`)
    .join("");
}

// A real chunk of Permen ESDM 10/2021 (D2-P18, page 14): chunk text, PDF page and bbox come from the
// real backend, only the LLM answer is mocked.
export const QUOTE =
  "Pengoperasian Instalasi Tenaga Listrik sebagaimana dimaksud dalam Pasal 6 huruf d dilakukan setelah memiliki sertifikat laik operasi.";

export const CITATION = {
  label: 1,
  chunk_id: "D2-P18",
  quote: QUOTE,
  ref: "Pasal 18",
  doc_id: "D2",
  doc_title:
    "Peraturan Menteri ESDM No. 10 Tahun 2021 tentang Keselamatan Ketenagalistrikan",
  page_start: 14,
};

const ANSWER_TEXT =
  "Pemilik instalasi wajib memiliki sertifikat laik operasi sebelum instalasi dioperasikan [1].";

export const DONE = {
  query_id: 1,
  abstained: false,
  abstain_reason: "",
  confidence: 0.9,
  badge: "supported",
  latency_ms: 1200,
  config: "M1",
};

export function answerEvents(): [string, unknown][] {
  const words = ANSWER_TEXT.match(/\S+\s*/g) ?? [];
  return [
    ...words.map((w): [string, unknown] => ["token", { text: w }]),
    ["citations", [CITATION]],
    ["done", DONE],
  ];
}

/** App alerts only (Next.js also renders its own role=alert route announcer). */
export const appAlert = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

export async function mockAsk(
  page: Page,
  events: [string, unknown][] = answerEvents(),
) {
  await page.route("**/api/ask", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
      body: sseBody(events),
    }),
  );
  await page.route("**/api/feedback", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: '{"status":"ok"}',
    }),
  );
}

export async function loginUi(page: Page, token: string, name?: string) {
  await page.goto("/masuk");
  await page.getByLabel("Token akses").fill(token);
  if (name) await page.getByLabel("Nama penilai").fill(name);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}

/** Open the answer page for a question with the mocked answer and wait until it is complete. */
export async function openAnswer(
  page: Page,
  q = "Apa kewajiban pemilik instalasi?",
) {
  await mockAsk(page);
  await page.goto(`/tanya?q=${encodeURIComponent(q)}&mode=standard`);
  await expect(page.getByTestId("confidence-badge")).toBeVisible();
}

/** The PDF canvas must hold real page content, not just exist (guards against blank renders). */
export async function expectPdfRendered(scope: Locator) {
  await expect
    .poll(
      () =>
        scope
          .locator("canvas")
          .first()
          .evaluate((c) => {
            const el = c as HTMLCanvasElement;
            const d = el
              .getContext("2d")!
              .getImageData(0, 0, el.width, el.height).data;
            let dark = 0;
            for (let i = 0; i < d.length; i += 4)
              if (d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 110) dark++;
            return dark;
          }),
      {
        message: "PDF canvas should contain dark (text) pixels",
        timeout: 40_000,
      },
    )
    .toBeGreaterThan(300);
}
