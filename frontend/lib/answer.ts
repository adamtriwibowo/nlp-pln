import type { Badge } from "./sse";

export type AnswerPart =
  { kind: "text"; text: string } | { kind: "cite"; labels: number[] };

/** Split answer text into plain text and citation markers such as [1] or [1, 2]. */
export function parseAnswer(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last)
      parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({
      kind: "cite",
      labels: m[1].split(",").map((n) => Number(n.trim())),
    });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export const BADGE_LABEL: Record<Badge, string> = {
  supported: "Didukung sumber",
  limited: "Bukti terbatas",
  not_found: "Tidak ditemukan di dokumen",
};

/** What the user can do next when an error occurs (status 0 = network failure). */
export function errorAdvice(
  status: number | undefined,
  message: string,
): string {
  if (status === 429) return `${message} Tunggu sebentar lalu coba lagi.`;
  if (status === 503) return `${message} Hubungi pengelola bila berlanjut.`;
  if (status === 422)
    return "Pertanyaan terlalu pendek atau tidak valid. Tulis minimal 3 karakter.";
  if (status === undefined || status === 0) {
    return "Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.";
  }
  return `${message} Coba lagi, atau rumuskan ulang pertanyaan.`;
}
