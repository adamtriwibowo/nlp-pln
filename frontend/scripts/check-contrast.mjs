// Verifies WCAG 2.1 AA contrast (4.5:1 text, 3:1 UI) for the design token pairs, light and dark.
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../styles/tokens.css", import.meta.url),
  "utf8",
);

function block(re) {
  const m = css.match(re);
  if (!m) throw new Error("token block not found: " + re);
  return Object.fromEntries(
    [...m[1].matchAll(/--k2-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((x) => [
      x[1],
      x[2],
    ]),
  );
}
const light = block(/^:root\s*\{([^}]*)\}/m);
const darkOverrides = block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
const themes = { light, dark: { ...light, ...darkOverrides } };

const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum, description]
const pairs = [
  ["ink", "ground", 4.5, "body text on page"],
  ["ink", "surface", 4.5, "body text on cards"],
  ["muted", "ground", 4.5, "secondary text on page"],
  ["muted", "surface", 4.5, "secondary text on cards"],
  ["muted", "surface-2", 4.5, "secondary text on tab/toggle track"],
  ["cite", "surface", 4.5, "citation links on cards"],
  ["cite", "cite-tint", 4.5, "citation chip (idle)"],
  ["on-cite", "cite", 4.5, "citation chip (active)"],
  ["brand-ink", "brand", 4.5, "primary button text"],
  ["ok", "ok-tint", 4.5, "badge: supported"],
  ["warn", "warn-tint", 4.5, "badge/disclaimer: limited"],
  ["danger", "danger-tint", 4.5, "error text"],
  ["danger", "surface", 4.5, "error text on cards"],
  ["cite", "ground", 3, "focus ring on page"],
  ["field", "surface", 3, "form control border on cards"],
  ["field", "ground", 3, "form control border on page"],
  ["line", "ground", 1.2, "card borders (decorative, informational only)"],
];

let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  for (const [fg, bg, min, why] of pairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    if (process.argv.includes("-v") || !ok)
      console.log(
        `${ok ? "ok  " : "FAIL"} ${name.padEnd(5)} ${fg} on ${bg} = ${r.toFixed(2)} (need ${min}) ${why}`,
      );
  }
}
if (failed) {
  console.error(`${failed} contrast check(s) failed`);
  process.exit(1);
}
console.log("all token contrast checks pass (AA)");
