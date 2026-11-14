import { defineConfig, devices } from "@playwright/test";

// E2E uses its own ports and role tokens (independent of the developer's .env). The ask endpoint is
// mocked per test (no LLM cost); documents, chunks and PDFs come from the real backend + database,
// so the PDF viewer and highlight are exercised for real. Requires the dev database (make db-up).
const API_PORT = 8011;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    locale: "id-ID",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `uv run uvicorn app.api.main:app --port ${API_PORT} --loop none`,
      cwd: "../backend",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ADMIN_TOKEN: "e2e-admin-token",
        REVIEW_TOKEN: "e2e-review-token",
        JWT_SECRET: "e2e-jwt-secret-e2e-jwt-secret-0123456789",
        ASK_RATE_PER_MIN: "1000",
        LOGIN_RATE_PER_MIN: "1000",
      },
    },
    {
      command: `npx -y pnpm@10 build && npx -y pnpm@10 exec next start -p ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { API_ORIGIN: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
