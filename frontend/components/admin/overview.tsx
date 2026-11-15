"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Circle, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  fetchAdminDocs,
  fetchEvalRuns,
  type AdminDoc,
  type EvalRun,
} from "@/lib/api";
import {
  fetchConfig,
  fetchQA,
  type ConfigSummary,
  type QAView,
} from "@/lib/lab-api";

type StepState = "done" | "todo" | "optional";
export interface Step {
  id: string;
  title: string;
  detail: string;
  state: StepState;
  /** Optional steps never count toward the readiness total. */
  optional?: boolean;
  href: string;
  cta: string;
}

/** Work out where the team stands on the road to the final evaluation (pure, unit-testable). */
export function buildSteps(
  docs: AdminDoc[],
  qa: QAView,
  cfg: ConfigSummary,
  runs: EvalRun[],
): Step[] {
  const indexable = docs.filter((d) => d.index && d.file_present);
  const corpusReady =
    indexable.length > 0 &&
    indexable.every((d) => d.ingested && d.chunks > 0) &&
    cfg.corpus.embeddings.some((e) => e.count > 0);
  const llmReady =
    Boolean(cfg.models.llm_model && cfg.models.judge_model) &&
    cfg.models.llm_model !== cfg.models.judge_model &&
    Boolean(cfg.secrets_set.openrouter_api_key);
  const { total, target_min, by_split } = qa.stats;
  const retrievalRuns = runs.filter((r) => !r.run_id.endsWith("_gen"));
  const genRuns = runs.filter((r) => r.run_id.endsWith("_gen"));
  const missingEn = docs
    .filter((d) => d.lang === "en" && !d.file_present)
    .map((d) => d.id);
  const frozenOk = qa.frozen !== null && qa.integrity === "ok";

  return [
    {
      id: "korpus",
      title: "Korpus terindeks",
      detail: corpusReady
        ? `${cfg.corpus.documents_indexed} dokumen, ${cfg.corpus.chunks} chunk, embedding tersedia.`
        : "Ada dokumen yang belum diproses atau embedding belum dibuat. Jalankan re-index.",
      state: corpusReady ? "done" : "todo",
      href: "/admin/dokumen",
      cta: "Buka dokumen",
    },
    {
      id: "llm",
      title: "LLM dan juri terkonfigurasi",
      detail: llmReady
        ? "Generator dan juri berbeda, kunci API terisi."
        : "Isi LLM_MODEL, JUDGE_MODEL (harus berbeda), dan OPENROUTER_API_KEY di .env.",
      state: llmReady ? "done" : "todo",
      href: "/admin/konfigurasi",
      cta: "Lihat konfigurasi",
    },
    {
      id: "dataset",
      title: `Dataset minimal ${target_min} pertanyaan`,
      detail: `${total} dari ${target_min} pertanyaan tertulis.`,
      state: total >= target_min ? "done" : "todo",
      href: "/admin/dataset",
      cta: "Tulis pertanyaan",
    },
    {
      id: "split",
      title: "Pertanyaan ada di split dev dan test",
      detail: `Dev ${by_split.dev}, test ${by_split.test}.`,
      state: by_split.dev > 0 && by_split.test > 0 ? "done" : "todo",
      href: "/admin/dataset",
      cta: "Atur split",
    },
    {
      id: "freeze",
      title: "Split test dibekukan",
      detail:
        qa.integrity === "modified"
          ? "Isi split test berbeda dari saat dibekukan. Periksa riwayat git."
          : frozenOk
            ? "Split test terkunci dan utuh."
            : "Bekukan sebelum mulai tuning agar split test tidak ikut terpakai.",
      state: frozenOk ? "done" : "todo",
      href: "/admin/dataset",
      cta: "Buka dataset",
    },
    {
      id: "baseline",
      title: "Baseline retrieval dijalankan",
      detail: retrievalRuns.length
        ? `${retrievalRuns.length} run retrieval tercatat.`
        : "Belum ada run. Jalankan B1, B2, dan M1 pada split dev.",
      state: retrievalRuns.length ? "done" : "todo",
      href: "/admin/konfigurasi",
      cta: "Jalankan evaluasi",
    },
    {
      id: "generation",
      title: "Evaluasi generasi dijalankan",
      detail: genRuns.length
        ? `${genRuns.length} run generasi tercatat.`
        : "Belum ada run generasi (faithfulness, sitasi, abstain).",
      state: genRuns.length ? "done" : "todo",
      href: "/admin/konfigurasi",
      cta: "Jalankan evaluasi",
    },
    {
      id: "english",
      title: "Dokumen bahasa Inggris (opsional)",
      detail: missingEn.length
        ? `${missingEn.join(", ")} belum diunduh. Unduh manual lalu taruh di data/raw/.`
        : "Dokumen bahasa Inggris tersedia.",
      state: missingEn.length ? "optional" : "done",
      optional: true,
      href: "/admin/dokumen",
      cta: "Buka dokumen",
    },
  ];
}

const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
function timeAgo(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 48) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

function keyMetric(r: EvalRun): string {
  const all = r.metrics?.all;
  if (!all) return "—";
  if (all.faithfulness !== undefined) {
    return `faithfulness ${all.faithfulness.toFixed(2)}, sitasi ${(all.citation_correctness ?? 0).toFixed(2)}`;
  }
  return `Recall@5 ${(all["recall@5"] ?? 0).toFixed(2)}, MRR ${(all.mrr ?? 0).toFixed(2)}`;
}

export function Overview() {
  const docs = useQuery({ queryKey: ["admin-docs"], queryFn: fetchAdminDocs });
  const qa = useQuery({ queryKey: ["qa"], queryFn: fetchQA });
  const cfg = useQuery({ queryKey: ["admin-config"], queryFn: fetchConfig });
  const runs = useQuery({ queryKey: ["eval-runs"], queryFn: fetchEvalRuns });
  const loading =
    docs.isPending || qa.isPending || cfg.isPending || runs.isPending;
  const failed = docs.isError || qa.isError || cfg.isError || runs.isError;

  const header = (
    <PageHeader
      title="Ringkasan"
      description="Kondisi korpus, dataset, dan evaluasi, serta langkah berikutnya menuju evaluasi final."
      actions={
        <>
          <Link
            href="/admin/uji"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-11 rounded-xl px-4 text-sm",
            )}
          >
            Uji satu pertanyaan
          </Link>
          <Link
            href="/admin/dataset"
            className={cn(
              buttonVariants(),
              "min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-ink hover:bg-brand/90",
            )}
          >
            Tulis pertanyaan uji
          </Link>
        </>
      }
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <div aria-busy="true" className="flex flex-col gap-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </>
    );
  }
  if (failed || !docs.data || !qa.data || !cfg.data || !runs.data) {
    return (
      <>
        {header}
        <p
          role="alert"
          className="rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger"
        >
          Ringkasan belum dapat dimuat. Periksa bahwa API berjalan, lalu muat
          ulang halaman.
        </p>
      </>
    );
  }

  const steps = buildSteps(docs.data, qa.data, cfg.data, runs.data);
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.state === "done").length;
  const pct = Math.round((doneCount / required.length) * 100);
  const next = steps.find((s) => s.state === "todo");
  const { limits } = cfg.data;

  const figures: [string, string, string][] = [
    [
      "Dokumen diindeks",
      String(cfg.data.corpus.documents_indexed),
      `${cfg.data.corpus.chunks} chunk`,
    ],
    [
      "Pertanyaan uji",
      String(qa.data.stats.total),
      `dev ${qa.data.stats.by_split.dev}, test ${qa.data.stats.by_split.test}`,
    ],
    [
      "Run evaluasi",
      String(runs.data.length),
      runs.data[0]
        ? `terakhir ${timeAgo(runs.data[0].created_at)}`
        : "belum ada",
    ],
    [
      "Biaya hari ini",
      `$${limits.daily_cost_used_usd.toFixed(3)}`,
      `batas $${limits.daily_cost_limit_usd.toFixed(2)}`,
    ],
  ];

  return (
    <>
      {header}

      {cfg.data.warnings.length > 0 ? (
        <ul className="m-0 mb-6 flex list-none flex-col gap-2 p-0">
          {cfg.data.warnings.map((w) => (
            <li
              key={w}
              className="flex items-start gap-2 rounded-lg bg-warn-tint px-3.5 py-2.5 text-sm text-warn"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <dl
        data-testid="overview-figures"
        className="m-0 mb-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-4"
      >
        {figures.map(([label, value, hint], i) => (
          <div
            key={label}
            className={`flex flex-col gap-0.5 px-5 py-4 ${i > 0 ? "lg:border-l lg:border-line" : ""} ${i % 2 === 1 ? "border-l border-line lg:border-l" : ""} ${i > 1 ? "border-t border-line lg:border-t-0" : ""}`}
          >
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="m-0 font-heading text-[28px] font-bold leading-tight tabular-nums">
              {value}
            </dd>
            <dd className="m-0 text-[13px] text-ink-muted">{hint}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="kesiapan" data-testid="readiness">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="kesiapan" className="m-0 text-lg font-semibold">
                Kesiapan evaluasi final
              </h2>
              <p
                className="m-0 text-sm text-ink-muted"
                data-testid="readiness-count"
              >
                {doneCount} dari {required.length} langkah wajib selesai
              </p>
            </div>
            {next ? (
              <Link
                href={next.href}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-cite no-underline hover:underline"
              >
                Berikutnya: {next.title.toLowerCase()}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          <div
            role="progressbar"
            aria-label="Kesiapan evaluasi final"
            aria-valuemin={0}
            aria-valuemax={required.length}
            aria-valuenow={doneCount}
            className="mb-5 h-2 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full bg-ok transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>

          <ol className="m-0 flex list-none flex-col p-0">
            {steps.map((s, i) => (
              <li
                key={s.id}
                data-testid={`step-${s.id}`}
                data-state={s.state}
                className="flex gap-4 border-t border-line py-4 first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
                    s.state === "done"
                      ? "bg-ok text-surface"
                      : s.state === "optional"
                        ? "border border-dashed border-field text-ink-muted"
                        : "border-2 border-cite text-cite"
                  }`}
                >
                  {s.state === "done" ? (
                    <Check className="size-4" />
                  ) : s.state === "optional" ? (
                    <Circle className="size-3" />
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
                    <p className="m-0 font-semibold">
                      {s.title}
                      <span className="sr-only">
                        {s.state === "done"
                          ? ", selesai"
                          : s.state === "optional"
                            ? ", opsional"
                            : ", belum selesai"}
                      </span>
                    </p>
                    <p className="m-0 text-sm leading-relaxed text-ink-muted">
                      {s.detail}
                    </p>
                  </div>
                  {s.state !== "done" ? (
                    <Link
                      href={s.href}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-cite no-underline hover:underline"
                    >
                      {s.cta}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside aria-labelledby="run-terbaru" className="flex flex-col gap-3">
          <h2 id="run-terbaru" className="m-0 text-lg font-semibold">
            Run terbaru
          </h2>
          {runs.data.length === 0 ? (
            <p
              data-testid="no-runs"
              className="m-0 rounded-xl border border-dashed border-field p-4 text-sm leading-relaxed text-ink-muted"
            >
              Belum ada run evaluasi. Setelah dataset terisi, jalankan evaluasi
              split dev dari menu Konfigurasi.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {runs.data.slice(0, 5).map((r) => (
                <li
                  key={r.run_id}
                  className="flex flex-col gap-0.5 border-t border-line py-3 first:border-t-0"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{r.config}</span>
                    <span className="text-[13px] text-ink-muted">
                      {timeAgo(r.created_at)}
                    </span>
                  </span>
                  <span className="text-sm text-ink-muted">{keyMetric(r)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/evaluasi"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-cite no-underline hover:underline"
          >
            Bandingkan run
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </>
  );
}
