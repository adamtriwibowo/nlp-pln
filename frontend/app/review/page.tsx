"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

import { AnswerView } from "@/components/answer-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  fetchReviewItem,
  submitScore,
  type Citation,
  type ReviewResponse,
} from "@/lib/api";
import { useRequireRole } from "@/lib/use-require-role";

const DIMENSIONS = [
  {
    key: "correctness",
    label: "Kebenaran",
    hint: "Isi jawaban sesuai peraturan",
  },
  {
    key: "completeness",
    label: "Kelengkapan",
    hint: "Semua hal penting tercakup",
  },
  { key: "usefulness", label: "Kegunaan", hint: "Jawaban membantu pekerjaan" },
] as const;
type DimKey = (typeof DIMENSIONS)[number]["key"];
type Scores = Partial<Record<DimKey, number>>;

export default function ReviewPage() {
  const { ready } = useRequireRole(["reviewer"], "/review");
  const qc = useQueryClient();
  const item = useQuery({
    queryKey: ["review-item"],
    queryFn: fetchReviewItem,
    enabled: ready,
    retry: false,
  });

  if (!ready || item.isPending) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-8" aria-busy="true">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </main>
    );
  }
  if (item.isError) {
    const forbidden =
      item.error instanceof ApiError && item.error.status === 403;
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-8">
        <p
          role="alert"
          className="rounded-lg bg-danger-tint px-4 py-3 text-danger"
        >
          {forbidden
            ? "Masuk dengan nama penilai agar penilaian tercatat atas nama Anda."
            : "Item penilaian tidak dapat dimuat. Muat ulang halaman ini."}
        </p>
      </main>
    );
  }
  return (
    <ReviewBoard
      data={item.data}
      onDone={() => qc.invalidateQueries({ queryKey: ["review-item"] })}
    />
  );
}

function ReviewBoard({
  data,
  onDone,
}: {
  data: ReviewResponse;
  onDone: () => Promise<unknown>;
}) {
  const { item, progress } = data;
  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-heading text-3xl font-bold tracking-tight">
            Review jawaban
          </h1>
          <p className="m-0 text-sm text-ink-muted">
            Nama konfigurasi disembunyikan. Nilai apa adanya berdasarkan teks
            pasal sumber.
          </p>
        </div>
        <a
          href="/api/review/export.csv"
          download
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-cite hover:bg-surface-2"
        >
          <Download className="size-4" aria-hidden="true" />
          Ekspor CSV
        </a>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-sm">
          <span>
            Progres: {progress.done} dari {progress.total} item
          </span>
          <span className="text-ink-muted">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Progres penilaian"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          className="h-2.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full bg-cite transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {item === null ? (
        <section
          className="rounded-2xl border border-line bg-surface p-8 text-center"
          data-testid="review-empty"
        >
          <h2 className="m-0 text-xl font-semibold">
            {progress.total === 0
              ? "Belum ada item untuk dinilai"
              : "Semua item sudah Anda nilai"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            {progress.total === 0
              ? "Item dibuat dari hasil evaluasi oleh admin (perintah review-seed). Kembali lagi setelah item tersedia."
              : "Terima kasih. Anda dapat mengunduh penilaian Anda sebagai CSV."}
          </p>
        </section>
      ) : (
        <ReviewItemCard key={item.item_id} item={item} onDone={onDone} />
      )}
    </main>
  );
}

function ReviewItemCard({
  item,
  onDone,
}: {
  item: NonNullable<ReviewResponse["item"]>;
  onDone: () => Promise<unknown>;
}) {
  const [scores, setScores] = useState<Scores>({});
  const [row, setRow] = useState(0);
  const [citationOk, setCitationOk] = useState(true);
  const [comment, setComment] = useState("");
  const [openLabel, setOpenLabel] = useState<number | null>(null);
  const commentId = useId();

  const complete = DIMENSIONS.every((d) => scores[d.key] !== undefined);
  const send = useMutation({
    mutationFn: () =>
      submitScore({
        item_id: item.item_id,
        correctness: scores.correctness!,
        completeness: scores.completeness!,
        usefulness: scores.usefulness!,
        citation_ok: citationOk,
        comment: comment.trim() || undefined,
      }),
    onSuccess: onDone,
  });

  const citations: Citation[] = item.answer.citations.map((c) => ({
    label: c.label,
    chunk_id: c.chunk_id,
    quote: c.quote,
    ref: c.ref ?? c.chunk_id,
    doc_id: null,
    doc_title: c.doc_title ?? null,
    page_start: c.page_start ?? null,
  }));

  const setScore = useCallback(
    (n: number) => {
      setScores((s) => ({ ...s, [DIMENSIONS[row].key]: n }));
      setRow((r) => Math.min(r + 1, DIMENSIONS.length - 1));
    },
    [row],
  );

  // Keyboard shortcuts: 1-5 score the active row, arrows move, S toggles citations, Enter submits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "TEXTAREA" || el.tagName === "INPUT";
      if (typing) {
        if (
          e.key === "Enter" &&
          (e.ctrlKey || e.metaKey) &&
          complete &&
          !send.isPending
        )
          send.mutate();
        return;
      }
      if (/^[1-5]$/.test(e.key)) setScore(Number(e.key));
      else if (e.key === "ArrowDown")
        setRow((r) => Math.min(r + 1, DIMENSIONS.length - 1));
      else if (e.key === "ArrowUp") setRow((r) => Math.max(r - 1, 0));
      else if (e.key.toLowerCase() === "s") setCitationOk((v) => !v);
      else if (
        e.key === "Enter" &&
        complete &&
        el.tagName !== "BUTTON" &&
        !send.isPending
      )
        send.mutate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [complete, send, setScore]);

  return (
    <div className="flex flex-col gap-6">
      <section
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6"
        aria-label="Pertanyaan dan jawaban"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
          Pertanyaan
        </span>
        <h2
          data-testid="review-question"
          className="m-0 font-heading text-xl font-semibold"
        >
          {item.question}
        </h2>
        <span className="mt-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
          Jawaban sistem
        </span>
        <AnswerView
          text={item.answer.answer}
          citations={citations}
          activeLabel={openLabel}
          onSelect={(n) => setOpenLabel((cur) => (cur === n ? null : n))}
          streaming={false}
        />
        {item.answer.abstained ? (
          <p className="m-0 text-sm text-ink-muted">
            Sistem memilih tidak menjawab (abstain).
          </p>
        ) : null}
      </section>

      {item.answer.citations.length > 0 ? (
        <section
          aria-labelledby="sitasi-review"
          className="flex flex-col gap-3"
        >
          <h3
            id="sitasi-review"
            className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted"
          >
            Sitasi
          </h3>
          {item.answer.citations.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-sm font-semibold">
                  [{c.label}] {c.ref ?? c.chunk_id}
                  {c.doc_title ? (
                    <span className="font-normal text-ink-muted">
                      {" "}
                      · {c.doc_title}
                    </span>
                  ) : null}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-lg px-3 text-sm text-cite"
                  aria-expanded={openLabel === c.label}
                  onClick={() =>
                    setOpenLabel((cur) => (cur === c.label ? null : c.label))
                  }
                >
                  {openLabel === c.label
                    ? "Sembunyikan teks pasal"
                    : "Lihat teks pasal"}
                </Button>
              </div>
              <blockquote className="m-0 mt-2 text-sm leading-relaxed">
                “{c.quote}”
              </blockquote>
              {openLabel === c.label ? (
                <p className="m-0 mt-3 whitespace-pre-line rounded-lg bg-surface-2 p-3 text-sm leading-[1.7]">
                  {c.text || "Teks chunk tidak tersedia."}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <section
        aria-label="Penilaian"
        className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6"
      >
        {DIMENSIONS.map((d, i) => (
          <div
            key={d.key}
            role="radiogroup"
            aria-label={`${d.label}: ${d.hint}`}
            data-active={row === i}
            onFocus={() => setRow(i)}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-2 ${
              row === i ? "bg-cite-tint" : ""
            }`}
          >
            <div className="flex flex-col">
              <span className="font-semibold">{d.label}</span>
              <span className="text-[13px] text-ink-muted">{d.hint}</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={scores[d.key] === n}
                  aria-label={`${d.label} ${n}`}
                  data-testid={`score-${d.key}-${n}`}
                  onClick={() => {
                    setRow(i);
                    setScores((s) => ({ ...s, [d.key]: n }));
                  }}
                  className={`size-11 cursor-pointer rounded-xl border text-base font-semibold transition-colors ${
                    scores[d.key] === n
                      ? "border-cite bg-cite text-on-cite"
                      : "border-field bg-surface text-ink hover:bg-surface-2"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={citationOk}
            onChange={(e) => setCitationOk(e.target.checked)}
            className="size-5 accent-[var(--k2-cite)]"
          />
          <span>Sitasi mendukung klaim dalam jawaban</span>
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={commentId} className="text-sm font-semibold">
            Komentar (opsional)
          </label>
          <Textarea
            id={commentId}
            rows={2}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="border-field bg-surface text-base"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            data-testid="submit-score"
            disabled={!complete || send.isPending}
            onClick={() => send.mutate()}
            className="min-h-12 rounded-xl bg-brand px-6 text-base font-semibold text-brand-ink hover:bg-brand/90"
          >
            {send.isPending ? "Menyimpan…" : "Kirim penilaian"}
          </Button>
          <p className="m-0 text-[13px] text-ink-muted">
            Pintasan: <kbd>1</kbd>–<kbd>5</kbd> menilai baris aktif lalu pindah,{" "}
            <kbd>↑</kbd>/<kbd>↓</kbd> ganti baris, <kbd>S</kbd> ubah status
            sitasi, <kbd>Enter</kbd> kirim.
          </p>
        </div>
        {send.isError ? (
          <p role="alert" className="m-0 text-sm text-danger">
            Penilaian belum tersimpan. Coba kirim lagi.
          </p>
        ) : null}
      </section>
    </div>
  );
}
