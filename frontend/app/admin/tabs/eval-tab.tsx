"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { fetchEvalRuns, type EvalRun } from "@/lib/api";

const METRIC_ROWS: {
  key: string;
  label: string;
  pct: boolean;
  lowerIsBetter?: boolean;
}[] = [
  { key: "recall@5", label: "Recall@5", pct: true },
  { key: "mrr", label: "MRR", pct: true },
  { key: "ndcg@5", label: "nDCG@5", pct: true },
  { key: "faithfulness", label: "Faithfulness", pct: true },
  { key: "citation_correctness", label: "Citation correctness", pct: true },
  { key: "answer_correctness", label: "Answer correctness", pct: true },
  { key: "abstain_accuracy", label: "Akurasi abstain", pct: true },
  {
    key: "latency_p95_ms",
    label: "Latensi p95 (ms)",
    pct: false,
    lowerIsBetter: true,
  },
  {
    key: "cost_per_q_usd",
    label: "Biaya / pertanyaan (USD)",
    pct: false,
    lowerIsBetter: true,
  },
];

function fmt(v: number | undefined, pct: boolean): string {
  if (v === undefined) return "—";
  return pct ? v.toFixed(3) : v < 1 ? v.toFixed(5) : v.toFixed(0);
}

export function EvalTab() {
  const runs = useQuery({ queryKey: ["eval-runs"], queryFn: fetchEvalRuns });
  const [picked, setPicked] = useState<string[]>([]);
  if (runs.isPending) return <Skeleton className="h-48 w-full" />;
  if (runs.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Run evaluasi tidak dapat dimuat.
      </p>
    );
  }
  if (runs.data.length === 0) {
    return (
      <section
        className="rounded-2xl border border-line bg-surface p-8 text-center"
        data-testid="eval-empty"
      >
        <h2 className="m-0 text-lg font-semibold">Belum ada run evaluasi</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
          Jalankan <code>make eval CONFIG=M1 SPLIT=dev</code> (retrieval) atau{" "}
          <code>make eval-gen CONFIG=M1 SPLIT=dev</code> (generasi) setelah{" "}
          <code>qa.jsonl</code> tersedia.
        </p>
      </section>
    );
  }
  const selected = runs.data.filter((r) => picked.includes(r.run_id));
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <>
      <section aria-labelledby="daftar-run" className="flex flex-col gap-3">
        <h2 id="daftar-run" className="m-0 text-lg font-semibold">
          Run evaluasi
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Daftar run evaluasi; centang untuk membandingkan
            </caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-ink-muted">
                <th scope="col" className="px-3 py-2.5">
                  Bandingkan
                </th>
                {["Run", "Konfigurasi", "Waktu", "n"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr
                  key={r.run_id}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-3 py-1">
                    <label className="flex min-h-11 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={picked.includes(r.run_id)}
                        onChange={() => toggle(r.run_id)}
                        aria-label={`Bandingkan ${r.run_id}`}
                        className="size-5 accent-[var(--k2-cite)]"
                      />
                    </label>
                  </td>
                  <th scope="row" className="px-3 py-2.5 font-medium">
                    {r.run_id}
                  </th>
                  <td className="px-3 py-2.5">{r.config}</td>
                  <td className="px-3 py-2.5">
                    {new Date(r.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2.5">{r.metrics?.all?.n ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected.length >= 2 ? (
        <CompareTable runs={selected} />
      ) : (
        <p className="m-0 text-sm text-ink-muted">
          Centang dua run atau lebih untuk melihat perbandingan.
        </p>
      )}
    </>
  );
}

function CompareTable({ runs }: { runs: EvalRun[] }) {
  return (
    <section aria-labelledby="bandingkan" className="flex flex-col gap-3">
      <h2 id="bandingkan" className="m-0 text-lg font-semibold">
        Perbandingan (semua pertanyaan)
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table
          className="w-full border-collapse text-left text-sm"
          data-testid="compare"
        >
          <thead>
            <tr className="border-b border-line text-[13px] text-ink-muted">
              <th scope="col" className="px-3 py-2.5">
                Metrik
              </th>
              {runs.map((r) => (
                <th
                  key={r.run_id}
                  scope="col"
                  className="px-3 py-2.5 font-semibold"
                >
                  {r.config}
                  <span className="block text-[11px] font-normal">
                    {r.run_id}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.filter((m) =>
              runs.some((r) => r.metrics?.all?.[m.key] !== undefined),
            ).map((m) => {
              const values = runs.map((r) => r.metrics?.all?.[m.key]);
              const defined = values.filter(
                (v): v is number => v !== undefined,
              );
              const best = m.lowerIsBetter
                ? Math.min(...defined)
                : Math.max(...defined);
              return (
                <tr key={m.key} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2.5 font-medium">
                    {m.label}
                  </th>
                  {values.map((v, i) => (
                    <td
                      key={runs[i].run_id}
                      className={`px-3 py-2.5 tabular-nums ${v !== undefined && v === best && defined.length > 1 ? "font-bold text-ok" : ""}`}
                    >
                      {fmt(v, m.pct)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[13px] text-ink-muted">
        Nilai terbaik per baris dicetak tebal.
      </p>
    </section>
  );
}
