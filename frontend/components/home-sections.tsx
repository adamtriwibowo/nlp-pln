"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  FileCheck2,
  FileSearch,
  MessageCircleQuestion,
  ShieldCheck,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { fetchDocuments } from "@/lib/api";

// Example prompts shown on the home page (UI suggestions only; not evaluation questions).
export const EXAMPLES = [
  "Apa kewajiban sebelum bekerja pada instalasi bertegangan?",
  "Siapa yang wajib memiliki sertifikat kompetensi?",
  "Pasal mana yang mengatur SMK2 bagi pemilik instalasi?",
  "Bagaimana ketentuan APD untuk pekerjaan listrik?",
];

const H2 =
  "m-0 font-heading text-2xl font-semibold tracking-tight sm:text-[28px]";

export function ExampleQuestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <section aria-labelledby="contoh" className="flex w-full flex-col gap-3">
      <h2 id="contoh" className="m-0 text-[15px] font-semibold text-ink-muted">
        Contoh pertanyaan
      </h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2">
        {EXAMPLES.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="group flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left text-[15px] leading-snug text-ink transition-[border-color,background-color,transform] hover:border-cite hover:bg-cite-tint active:scale-[0.99]"
            >
              <span>{q}</span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 shrink-0 text-ink-muted transition-colors group-hover:text-cite"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  {
    icon: MessageCircleQuestion,
    title: "Tulis pertanyaan",
    text: "Pakai bahasa sehari-hari. Tidak perlu tahu nomor pasalnya lebih dulu.",
  },
  {
    icon: FileSearch,
    title: "Sistem mencari pasal",
    text: "Pasal yang paling relevan dicari dari dokumen resmi, lalu jawaban disusun hanya dari pasal itu.",
  },
  {
    icon: FileCheck2,
    title: "Kutipan diperiksa",
    text: "Setiap sitasi dicocokkan dengan teks sumber sebelum ditampilkan. Bila bukti kurang, sistem menolak menjawab.",
  },
  {
    icon: ShieldCheck,
    title: "Cek sendiri di PDF",
    text: "Klik nomor sitasi untuk membuka halaman PDF dengan kalimat yang dikutip tersorot.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="cara-kerja"
      aria-labelledby="cara"
      className="mx-auto w-full max-w-[1160px] scroll-mt-20 px-6 py-14"
    >
      <h2 id="cara" className={H2}>
        Dari pertanyaan ke pasal, dalam empat langkah
      </h2>
      <ol className="m-0 mt-8 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li
            key={title}
            className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-lg bg-brand text-brand-ink">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span
                aria-hidden="true"
                className="font-heading text-2xl font-semibold text-line"
              >
                {i + 1}
              </span>
            </div>
            <h3 className="m-0 text-lg font-semibold leading-snug">{title}</h3>
            <p className="m-0 text-[15px] leading-relaxed text-ink-muted">
              {text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CorpusChips() {
  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
    staleTime: 5 * 60_000,
  });
  return (
    <section
      id="dokumen"
      aria-labelledby="korpus"
      className="mx-auto w-full max-w-[1160px] scroll-mt-20 px-6 pb-14"
    >
      <h2 id="korpus" className={H2}>
        Dokumen yang menjadi sumber jawaban
      </h2>
      <p className="m-0 mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
        Hanya dokumen publik berbahasa Indonesia di bawah ini. Tidak ada sumber
        lain yang dipakai untuk menjawab.
      </p>
      {docs.isPending ? (
        <div
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
        >
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : docs.isError ? (
        <p role="status" className="mt-6 text-sm text-ink-muted">
          Daftar dokumen belum dapat dimuat. Muat ulang halaman sebentar lagi.
        </p>
      ) : (
        <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {docs.data
            .filter((d) => d.indexed)
            .map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5"
              >
                <span className="font-semibold leading-snug">
                  {shortTitle(d.title)}
                </span>
                {topic(d.title) ? (
                  <span className="text-[15px] leading-snug text-ink-muted">
                    {topic(d.title)}
                  </span>
                ) : null}
                <span className="mt-auto flex flex-col items-start gap-1 pt-2 text-[13px] text-ink-muted">
                  <span>{d.publisher ?? "Penerbit tidak dicatat"}</span>
                  {d.source_url ? (
                    <a
                      href={d.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-6 items-center gap-1 font-medium text-cite hover:underline"
                    >
                      Sumber resmi
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

/** "Peraturan Menteri ESDM No. 10 Tahun 2021 tentang ..." -> "Permen ESDM No. 10 Tahun 2021". */
export function shortTitle(title: string): string {
  const head = title.split(/\s+tentang\s+/i)[0];
  return head
    .replace(/^Peraturan Menteri Ketenagakerjaan/i, "Permenaker")
    .replace(/^Peraturan Menteri/i, "Permen");
}

/** The "tentang ..." part of a regulation title, if it has one. */
function topic(title: string): string {
  const parts = title.split(/\s+tentang\s+/i);
  return parts.length > 1 ? parts.slice(1).join(" tentang ") : "";
}
