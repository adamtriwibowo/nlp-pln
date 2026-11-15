"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, FlaskConical, TriangleAlert, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { fetchQA, runPlayground, type PlaygroundResult } from "@/lib/lab-api";

const CONFIGS: { id: string; label: string; forcesLlm?: boolean }[] = [
  { id: "B0", label: "B0 · LLM tanpa retrieval", forcesLlm: true },
  { id: "B1", label: "B1 · BM25" },
  { id: "B2", label: "B2 · Dense (bge-m3)" },
  { id: "M1", label: "M1 · Hybrid RRF (model utama)" },
  { id: "M2", label: "M2 · Hybrid + reranker (butuh paket tambahan)" },
  { id: "M3", label: "M3 · Agentik", forcesLlm: true },
];

export function PlaygroundTab() {
  const ids = { q: useId(), cfg: useId(), gold: useId(), pick: useId() };
  const qa = useQuery({ queryKey: ["qa"], queryFn: fetchQA });
  const [question, setQuestion] = useState("");
  const [configId, setConfigId] = useState("M1");
  const [withLlm, setWithLlm] = useState(false);
  const [goldText, setGoldText] = useState("");
  const forced = CONFIGS.find((c) => c.id === configId)?.forcesLlm ?? false;
  const generate = forced || withLlm;

  const run = useMutation({
    mutationFn: () =>
      runPlayground({
        question: question.trim(),
        config_id: configId,
        generate,
        gold_chunk_ids: goldText
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
  });
  const error =
    run.error instanceof ApiError
      ? run.error.message
      : run.error
        ? "Permintaan gagal."
        : null;
  const field = "min-h-11 border-field bg-surface text-base";

  return (
    <>
      <section
        aria-labelledby="uji"
        className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
      >
        <h2 id="uji" className="m-0 text-lg font-semibold">
          Uji pertanyaan
        </h2>
        <p className="m-0 text-sm text-ink-muted">
          Jalankan satu pertanyaan pada konfigurasi pilihan: lihat peringkat
          chunk, apakah gold ditemukan, dan (bila memakai LLM) jawaban beserta
          pemeriksaan sitasinya. Hasil <em>hanya retrieval</em> gratis.
        </p>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={ids.pick} className="text-sm font-semibold">
              Ambil dari dataset (opsional)
            </label>
            <select
              id={ids.pick}
              defaultValue=""
              onChange={(e) => {
                const item = qa.data?.items.find(
                  (i) => i.id === e.target.value,
                );
                if (item) {
                  setQuestion(item.question);
                  setGoldText(item.gold_chunk_ids.join(", "));
                }
              }}
              className={`${field} rounded-lg border px-3`}
            >
              <option value="">— pilih pertanyaan —</option>
              {qa.data?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id} [{i.split}] {i.question.slice(0, 70)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={ids.q} className="text-sm font-semibold">
              Pertanyaan
            </label>
            <Textarea
              id={ids.q}
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="border-field bg-surface text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.cfg} className="text-sm font-semibold">
              Konfigurasi
            </label>
            <select
              id={ids.cfg}
              value={configId}
              onChange={(e) => setConfigId(e.target.value)}
              className={`${field} rounded-lg border px-3`}
            >
              {CONFIGS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.gold} className="text-sm font-semibold">
              Chunk gold (opsional, pisahkan dengan koma)
            </label>
            <Input
              id={ids.gold}
              value={goldText}
              onChange={(e) => setGoldText(e.target.value)}
              placeholder="D2-P18, D2-P35"
              className={field}
            />
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={generate}
              disabled={forced}
              onChange={(e) => setWithLlm(e.target.checked)}
              className="mt-1 size-5 accent-[var(--k2-cite)]"
            />
            <span className="text-sm">
              <strong>Sertakan jawaban LLM</strong>
              <span className="block text-[13px] text-ink-muted">
                {forced
                  ? "Wajib untuk konfigurasi ini. Memanggil model (kira-kira $0,0005–$0,002 per pertanyaan)."
                  : "Memanggil model dan menambah biaya (kira-kira $0,0005–$0,002). Kosongkan untuk hanya melihat peringkat retrieval."}
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button
              type="submit"
              data-testid="run-playground"
              disabled={run.isPending || question.trim().length < 3}
              className="min-h-11 rounded-xl bg-brand px-6 font-semibold text-brand-ink hover:bg-brand/90"
            >
              <FlaskConical aria-hidden="true" />
              {run.isPending ? "Menjalankan…" : "Jalankan"}
            </Button>
            {error ? (
              <span
                role="alert"
                data-testid="playground-error"
                className="text-sm text-danger"
              >
                {error}
              </span>
            ) : null}
          </div>
        </form>
      </section>
      {run.data ? <PlaygroundResultView r={run.data} /> : null}
    </>
  );
}

function PlaygroundResultView({ r }: { r: PlaygroundResult }) {
  return (
    <div data-testid="playground-result" className="flex flex-col gap-5">
      {r.gold ? (
        <p
          data-testid="gold-summary"
          className={`m-0 rounded-lg px-3.5 py-2.5 text-sm ${
            r.gold.best_rank !== null
              ? "bg-ok-tint text-ok"
              : "bg-warn-tint text-warn"
          }`}
        >
          {r.gold.best_rank !== null
            ? `Gold ditemukan; yang terbaik di peringkat ${r.gold.best_rank}. `
            : `Tidak ada chunk gold di ${r.gold.depth} teratas. `}
          {Object.entries(r.gold.found)
            .map(([id, rank]) => `${id}: ${rank ?? "tidak ditemukan"}`)
            .join(" · ")}
        </p>
      ) : null}

      <section aria-labelledby="peringkat" className="flex flex-col gap-2">
        <h3 id="peringkat" className="m-0 text-base font-semibold">
          Peringkat retrieval ({r.config}
          {r.ranking.length ? `, ${r.retrieval_ms} ms` : ""})
        </h3>
        {r.ranking.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">
            Konfigurasi {r.config} tidak memiliki retrieval mandiri (peringkat
            tidak ditampilkan).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table
              className="w-full min-w-[720px] border-collapse text-left text-sm"
              data-testid="ranking"
            >
              <caption className="sr-only">
                Peringkat chunk hasil retrieval
              </caption>
              <thead>
                <tr className="border-b border-line text-[13px] text-ink-muted">
                  {["#", "Chunk", "Skor", "Ke API", "Cuplikan"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2.5 font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.ranking.map((x) => (
                  <tr
                    key={x.chunk_id}
                    data-testid={`rank-${x.rank}`}
                    data-gold={x.is_gold}
                    className={`border-b border-line align-top last:border-0 ${x.is_gold ? "bg-ok-tint" : ""}`}
                  >
                    <th scope="row" className="px-3 py-2.5 font-semibold">
                      {x.rank}
                    </th>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{x.chunk_id}</span>
                      {x.is_gold ? (
                        <span className="ml-2 rounded-full bg-ok px-2 py-0.5 text-[11px] font-semibold text-surface">
                          gold
                        </span>
                      ) : null}
                      <span className="block text-[13px] text-ink-muted">
                        {x.ref} · hlm. {x.page_start}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{x.score}</td>
                    <td className="px-3 py-2.5">
                      {x.api_allowed ? "ya" : "tidak"}
                    </td>
                    <td className="max-w-sm px-3 py-2.5 text-[13px] leading-snug">
                      <span className="line-clamp-3">{x.snippet}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {r.answer ? (
        <section
          aria-labelledby="jawaban-uji"
          className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
        >
          <h3 id="jawaban-uji" className="m-0 text-base font-semibold">
            Jawaban {r.answer.abstained ? "(abstain)" : ""}
          </h3>
          <p
            data-testid="pg-answer"
            className="m-0 whitespace-pre-line leading-relaxed"
          >
            {r.answer.answer}
          </p>
          <p className="m-0 text-[13px] text-ink-muted">
            keyakinan {r.answer.confidence.toFixed(2)}
            {r.answer.abstain_reason
              ? ` · alasan abstain: ${r.answer.abstain_reason}`
              : ""}
          </p>
          {r.answer.audit_removed.length > 0 ? (
            <p className="m-0 text-[13px] text-warn">
              Auditor menghapus {r.answer.audit_removed.length} klaim tak
              terdukung.
            </p>
          ) : null}
          <ul
            data-testid="pg-citations"
            className="m-0 flex list-none flex-col gap-2 p-0"
          >
            {r.answer.citations.map((c) => {
              const ok = c.in_context && c.quote_verified;
              return (
                <li
                  key={`${c.label}-${c.chunk_id}`}
                  data-ok={ok}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${ok ? "bg-ok-tint text-ok" : "bg-danger-tint text-danger"}`}
                >
                  {ok ? (
                    <Check
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <TriangleAlert
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    <strong>
                      [{c.label}] {c.chunk_id}
                    </strong>{" "}
                    ({c.ref}){c.is_gold ? " · gold" : ""}:{" "}
                    {ok
                      ? "kutipan ditemukan di teks chunk"
                      : !c.in_context
                        ? "chunk TIDAK ada di konteks"
                        : "kutipan TIDAK ditemukan di teks chunk"}
                    <span className="block text-[13px] opacity-90">
                      “{c.quote}”
                    </span>
                  </span>
                </li>
              );
            })}
            {r.answer.citations.length === 0 ? (
              <li className="text-sm text-ink-muted">Tidak ada sitasi.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {r.steps.length > 0 ? (
        <section aria-labelledby="langkah-uji" className="flex flex-col gap-2">
          <h3 id="langkah-uji" className="m-0 text-base font-semibold">
            Langkah agen ({r.steps.length})
          </h3>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {r.steps.map((s, i) => (
              <li key={i} className="border-l-2 border-line pl-3">
                {i + 1}. <strong>{s.tool}</strong> {JSON.stringify(s.args)} →{" "}
                {s.summary}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {r.usage ? (
        <p data-testid="pg-usage" className="m-0 text-[13px] text-ink-muted">
          {r.usage.model} · {r.usage.input_tokens + r.usage.output_tokens} token
          · ${r.usage.cost_usd.toFixed(5)} · {r.usage.latency_ms} ms
        </p>
      ) : (
        <p className="m-0 flex items-center gap-1.5 text-[13px] text-ink-muted">
          <X className="size-3.5" aria-hidden="true" />
          LLM tidak dipanggil (hanya retrieval).
        </p>
      )}
    </div>
  );
}
