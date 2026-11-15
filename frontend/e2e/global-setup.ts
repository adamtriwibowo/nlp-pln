import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

/** Fresh, isolated eval directory for the e2e API (never touches data/eval/qa.jsonl). */
export const E2E_EVAL_DIR = path.resolve(__dirname, ".tmp", "eval");

export default function globalSetup() {
  rmSync(E2E_EVAL_DIR, { recursive: true, force: true });
  mkdirSync(E2E_EVAL_DIR, { recursive: true });
}
