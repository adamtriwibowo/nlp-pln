"use client";

import { useQuery } from "@tanstack/react-query";
import { FileCheck2, ListChecks, ShieldAlert } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { fetchDocuments } from "@/lib/api";

// Example prompts shown on the home page (UI suggestions only; not evaluation questions).
export const EXAMPLES = [
  "Apa kewajiban sebelum bekerja pada instalasi bertegangan?",
  "Siapa yang wajib memiliki sertifikat kompetensi?",
  "Pasal mana yang mengatur SMK2 bagi pemilik instalasi?",
  "Bagaimana ketentuan APD untuk pekerjaan listrik?",
];

export function ExampleQuestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <section aria-labelledby="contoh" className="flex w-full flex-col gap-3">
      <h2
        id="contoh"
        className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
      >
        Coba tanyakan
      </h2>
      <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
        {EXAMPLES.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="flex min-h-16 w-full cursor-pointer items-center rounded-xl border border-line bg-surface px-4 py-3 text-left text-[15px] leading-snug text-ink transition-colors hover:border-cite"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrustRow() {
  const item = (Icon: typeof FileCheck2, text: string) => (
    <li className="flex items-center gap-2 text-sm text-ink-muted">
      <Icon className="size-[18px] text-cite" aria-hidden="true" />
      <span>{text}</span>
    </li>
  );
  return (
    <ul
      id="cara-kerja"
      aria-label="Jaminan layanan"
      className="mt-4 flex list-none flex-wrap justify-center gap-x-8 gap-y-3 p-0"
    >
      {item(FileCheck2, "Dijawab hanya dari dokumen resmi")}
      {item(ListChecks, "Setiap jawaban menyertakan pasal")}
      {item(ShieldAlert, "Menolak menjawab bila bukti tidak cukup")}
    </ul>
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
      className="flex flex-col items-center gap-3.5 px-6 pb-10 pt-6"
    >
      <h2
        id="korpus"
        className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
      >
        Dokumen dalam korpus
      </h2>
      {docs.isPending ? (
        <div className="flex gap-2" aria-busy="true">
          <Skeleton className="h-8 w-40 rounded-full" />
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
      ) : docs.isError ? (
        <p role="status" className="text-sm text-ink-muted">
          Daftar dokumen belum dapat dimuat.
        </p>
      ) : (
        <ul className="flex max-w-3xl list-none flex-wrap justify-center gap-2 p-0">
          {docs.data
            .filter((d) => d.indexed)
            .map((d) => (
              <li
                key={d.id}
                className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px]"
                title={d.title}
              >
                {shortTitle(d.title)}
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
