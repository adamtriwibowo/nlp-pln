// Copies the pdf.js runtime assets the viewer needs into public/pdfjs (served same-origin):
//  - wasm/            JBIG2 + OpenJPEG decoders (the corpus PDFs are scans with an OCR text layer)
//  - cmaps/           character maps for CJK / non-embedded encodings
//  - standard_fonts/  fallback fonts for PDFs that do not embed them
// public/pdfjs is generated (git-ignored); this runs before dev and build.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "pdfjs",
);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const dir of ["wasm", "cmaps", "standard_fonts"]) {
  const from = join(root, dir);
  if (!existsSync(from)) throw new Error(`pdfjs-dist is missing ${dir}/`);
  cpSync(from, join(out, dir), { recursive: true });
}
console.log("pdf.js assets copied to public/pdfjs");
