"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Play, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { isRunning, JobBox, useJobPolling } from "@/components/job-box";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
  estimateEval,
  fetchConfig,
  startEval,
  type EvalInput,
} from "@/lib/lab-api";

const errText = (e: unknown, fallback: string) =>
  e instanceof ApiError ? e.message : fallback;

export function ConfigTab() {
  const cfg = useQuery({ queryKey: ["admin-config"], queryFn: fetchConfig });
  if (cfg.isPending) return <Skeleton className="h-96 w-full" />;
  if (cfg.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {errText(cfg.error, "Konfigurasi tidak dapat dimuat.")}
      </p>
    );
  }
  const c = cfg.data;
  const used = c.limits.daily_cost_used_usd;
  const limit = c.limits.daily_cost_limit_usd;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const card =
    "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5";
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex flex-wrap justify-between gap-2 border-b border-line py-1.5 text-sm last:border-0">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="m-0 break-all font-medium">
        {v || <span className="text-danger">belum diisi</span>}
      </dd>
    </div>
  );

  return (
    <>
      {c.warnings.length > 0 ? (
        <ul
          data-testid="config-warnings"
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {c.warnings.map((w) => (
            <li
              key={w}
              role="alert"
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

      <p className="m-0 rounded-lg bg-surface-2 px-3.5 py-2.5 text-sm text-ink-muted">
        Tampilan <strong>baca-saja</strong>. Konfigurasi diubah lewat{" "}
        <code>configs/*.yaml</code> dan <code>.env</code> (lalu mulai ulang API)
        agar setiap perubahan tercatat di git dan hasil eksperimen tetap
        sebanding.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="model" className={card}>
          <h2 id="model" className="m-0 text-lg font-semibold">
            Model
          </h2>
          <dl className="m-0">
            {row("LLM (generator)", c.models.llm_model)}
            {row("Juri evaluasi", c.models.judge_model)}
            {row(
              "Embedding",
              `${c.models.embedding_provider} · ${c.models.embedding_model}`,
            )}
            {row("Reranker (M2)", c.models.reranker_model)}
            {row(
              "Prompt jawaban / juri",
              `${c.prompts.answer} / ${c.prompts.judge}`,
            )}
            {row("Tracing OTel", c.tracing_enabled ? "aktif" : "nonaktif")}
          </dl>
          <h3 className="m-0 mt-2 text-sm font-semibold">Rahasia terpasang</h3>
          <ul
            data-testid="secrets"
            className="m-0 flex list-none flex-wrap gap-2 p-0"
          >
            {Object.entries(c.secrets_set).map(([k, v]) => (
              <li
                key={k}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${v ? "bg-ok-tint text-ok" : "bg-danger-tint text-danger"}`}
              >
                {v ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <X className="size-3.5" aria-hidden="true" />
                )}
                {k} {v ? "terisi" : "kosong"}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[13px] text-ink-muted">
            Nilainya tidak pernah ditampilkan.
          </p>
        </section>

        <section aria-labelledby="korpus-batas" className={card}>
          <h2 id="korpus-batas" className="m-0 text-lg font-semibold">
            Korpus dan batas
          </h2>
          <dl className="m-0">
            {row("corpus_version", c.corpus.versions.join(", "))}
            {row("Dokumen diindeks", c.corpus.documents_indexed)}
            {row("Chunk", c.corpus.chunks)}
            {row(
              "Embedding",
              c.corpus.embeddings
                .map((e) => `${e.model} (${e.count})`)
                .join(", ") || "belum ada",
            )}
            {row("Laju tanya / menit", c.limits.ask_rate_per_min)}
            {row("Laju login / menit", c.limits.login_rate_per_min)}
          </dl>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span>
                Biaya hari ini ${used.toFixed(4)} dari ${limit.toFixed(2)}
              </span>
              <span className="text-ink-muted">{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Pemakaian biaya harian"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={Math.min(used, limit)}
              className="h-2.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className={`h-full ${pct >= 90 ? "bg-danger" : "bg-cite"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </section>
      </div>

      <section
        aria-labelledby="konfigurasi-eksperimen"
        className="flex flex-col gap-3"
      >
        <h2 id="konfigurasi-eksperimen" className="m-0 text-lg font-semibold">
          Konfigurasi eksperimen
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table
            className="w-full min-w-[760px] border-collapse text-left text-sm"
            data-testid="configs"
          >
            <caption className="sr-only">
              Konfigurasi eksperimen (dari configs/*.yaml)
            </caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-ink-muted">
                {[
                  "ID",
                  "Retriever",
                  "Mode",
                  "top_k",
                  "RRF k",
                  "Kandidat",
                  "Stem",
                  "Kecualikan",
                  "Embedding",
                ].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.configs.map((x) => (
                <tr key={x.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2.5 font-semibold">
                    {x.id}
                  </th>
                  <td className="px-3 py-2.5">{x.retriever}</td>
                  <td className="px-3 py-2.5">{x.mode}</td>
                  <td className="px-3 py-2.5">{x.top_k}</td>
                  <td className="px-3 py-2.5">{x.rrf_k}</td>
                  <td className="px-3 py-2.5">{x.candidate_k}</td>
                  <td className="px-3 py-2.5">{x.stem ? "ya" : "tidak"}</td>
                  <td className="px-3 py-2.5">
                    {x.exclude_kinds.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {x.embedding_model ?? "default (.env)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <EvalRunner />
    </>
  );
}

const EVAL_CONFIGS = ["B0", "B1", "B2", "M1", "M2", "M3"];

function EvalRunner() {
  const qc = useQueryClient();
  const ids = { cfg: useId(), kind: useId() };
  const [configId, setConfigId] = useState("M1");
  const [kind, setKind] = useState<EvalInput["kind"]>("retrieval");
  const [jobId, setJobId] = useState<string | null>(null);
  const input: EvalInput = { config_id: configId, kind, split: "dev" };

  const estimate = useMutation({ mutationFn: () => estimateEval(input) });
  const start = useMutation({
    mutationFn: () => startEval(input),
    onSuccess: (job) => {
      setJobId(job.id);
      estimate.reset();
    },
  });
  const job = useJobPolling(jobId);
  const running = start.isPending || isRunning(job.data);
  const finished = job.data?.status === "done";
  useEffect(() => {
    if (finished) void qc.invalidateQueries({ queryKey: ["eval-runs"] });
  }, [finished, qc]);

  const field =
    "min-h-11 rounded-lg border border-field bg-surface px-3 text-base";
  return (
    <section
      aria-labelledby="jalankan-eval"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <h2 id="jalankan-eval" className="m-0 text-lg font-semibold">
        Jalankan evaluasi (split dev)
      </h2>
      <p className="m-0 text-sm text-ink-muted">
        Hanya split <strong>dev</strong>. Evaluasi pada split test yang
        dibekukan sengaja hanya lewat CLI (
        <code>k2 eval --split test --final</code>). Hasilnya muncul di tab
        Evaluasi.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.cfg} className="text-[13px] font-semibold">
            Konfigurasi
          </label>
          <select
            id={ids.cfg}
            value={configId}
            onChange={(e) => {
              setConfigId(e.target.value);
              estimate.reset();
            }}
            className={field}
          >
            {EVAL_CONFIGS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.kind} className="text-[13px] font-semibold">
            Jenis
          </label>
          <select
            id={ids.kind}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as EvalInput["kind"]);
              estimate.reset();
            }}
            className={field}
          >
            <option value="retrieval">Retrieval (hampir gratis)</option>
            <option value="generation">
              Generasi (berbiaya, memakai juri)
            </option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          data-testid="estimate-eval"
          disabled={running || estimate.isPending}
          onClick={() => estimate.mutate()}
          className="min-h-11 rounded-xl px-4"
        >
          Perkirakan biaya
        </Button>
      </div>

      {estimate.isError ? (
        <p
          role="alert"
          data-testid="estimate-error"
          className="m-0 text-sm text-danger"
        >
          {errText(estimate.error, "Tidak dapat memperkirakan.")}
        </p>
      ) : null}
      {estimate.data ? (
        <div
          data-testid="estimate-box"
          className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4 text-sm"
        >
          <p className="m-0">
            <strong>{estimate.data.n_questions}</strong> pertanyaan · perkiraan
            biaya <strong>${estimate.data.est_cost_usd.toFixed(4)}</strong>
          </p>
          <p className="m-0 text-[13px] text-ink-muted">{estimate.data.note}</p>
          <div>
            <Button
              type="button"
              data-testid="start-eval"
              disabled={running}
              onClick={() => start.mutate()}
              className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-ink hover:bg-brand/90"
            >
              <Play aria-hidden="true" />
              Ya, jalankan {kind === "retrieval"
                ? "retrieval"
                : "generasi"}{" "}
              {configId}
            </Button>
          </div>
        </div>
      ) : null}
      {start.isError ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {errText(start.error, "Gagal memulai evaluasi.")}
        </p>
      ) : null}
      {job.data ? <JobBox job={job.data} testId="eval-job-status" /> : null}
    </section>
  );
}
