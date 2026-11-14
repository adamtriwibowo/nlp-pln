// Manual end-to-end check against the RUNNING stack with the real LLM (costs ~$0.0005).
// Usage: start the API (:8010) and the web app (:3000), then `pnpm live-check "pertanyaan"`.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const question =
  process.argv[2] ?? "Siapa yang bertanggung jawab terhadap penerapan SMK2?";
const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "docs",
  "screenshots",
);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/`);
await page.getByLabel("Pertanyaan Anda").fill(question);
await page.getByRole("button", { name: /^Tanya/ }).click();
await page.getByTestId("confidence-badge").waitFor({ timeout: 90_000 });
console.log(
  "badge:",
  await page.getByTestId("confidence-badge").getAttribute("data-badge"),
);
console.log(
  "answer:",
  (await page.getByTestId("answer").innerText()).replace(/\s+/g, " "),
);
const chip = page.getByTestId("cite-1");
if (await chip.count()) {
  await chip.click();
  const panel = page.getByTestId("source-panel");
  await panel.locator("canvas").waitFor({ timeout: 40_000 });
  await panel.getByTestId("pdf-highlight").first().waitFor({ timeout: 40_000 });
  await page.waitForTimeout(1500);
  console.log(
    "source:",
    (await panel.locator("h2").innerText()).replace(/\s+/g, " "),
  );
}
await page.screenshot({ path: path.join(out, "05-live-llm.png") });
await browser.close();
console.log("saved docs/screenshots/05-live-llm.png");
