"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Upload } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ApiError,
  fetchAdminDocs,
  fetchEvalRuns,
  fetchJob,
  startReindex,
  uploadDocument,
  type EvalRun,
} from "@/lib/api";
import { useRequireRole } from "@/lib/use-require-role";

export default function AdminPage() {
  const { ready } = useRequireRole([], "/admin");
  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-8" aria-busy="true">
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <h1 className="m-0 font-heading text-3xl font-bold tracking-tight">
        Admin
      </h1>
      <Tabs defaultValue="dokumen">
        <TabsList className="h-11 p-1">
          <TabsTrigger value="dokumen" className="min-h-9 px-5 text-sm">
            Dokumen
          </TabsTrigger>
          <TabsTrigger value="evaluasi" className="min-h-9 px-5 text-sm">
            Evaluasi
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dokumen" className="flex flex-col gap-6 pt-4">
          <DocumentsTab />
        </TabsContent>
        <TabsContent value="evaluasi" className="flex flex-col gap-6 pt-4">
          <EvalTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

const yesNo = (v: boolean) => (v ? "ya" : "tidak");

function DocumentsTab() {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ["admin-docs"], queryFn: fetchAdminDocs });
  const [jobId, setJobId] = useState<string | null>(null);
  const reindex = useMutation({
    mutationFn: startReindex,
    onSuccess: (job) => setJobId(job.id),
  });
  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId!),
    enabled: jobId !== null,
    refetchInterval: (q) =>
      q.state.data && ["done", "failed"].includes(q.state.data.status)
        ? false
        : 1500,
  });
  const running =
    reindex.isPending ||
    job.data?.status === "queued" ||
    job.data?.status === "running";

  const reindexError =
    reindex.error instanceof ApiError
      ? reindex.error.message
      : reindex.error
        ? "Gagal memulai reindex."
        : null;

  return (
    <>
      <section
        aria-labelledby="reindex"
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
      >
        <h2 id="reindex" className="m-0 text-lg font-semibold">
          Re-index
        </h2>
        <p className="m-0 text-sm text-ink-muted">
          Membaca ulang semua PDF, memperbarui chunk, lalu membangun embedding.
          Berjalan di latar belakang.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={running}
            onClick={() => reindex.mutate()}
            data-testid="reindex"
            className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-ink hover:bg-brand/90"
          >
            <RefreshCw
              aria-hidden="true"
              className={running ? "animate-spin" : ""}
            />
            {running ? "Sedang berjalan…" : "Mulai re-index"}
          </Button>
          {job.data ? (
            <span
              role="status"
              data-testid="job-status"
              className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                job.data.status === "failed"
                  ? "bg-danger-tint text-danger"
                  : job.data.status === "done"
                    ? "bg-ok-tint text-ok"
                    : "bg-warn-tint text-warn"
              }`}
            >
              {
                {
                  queued: "Antre",
                  running: "Berjalan",
                  done: "Selesai",
                  failed: "Gagal",
                }[job.data.status]
              }
            </span>
          ) : null}
        </div>
        {reindexError ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {reindexError}
          </p>
        ) : null}
        {job.data ? (
          <pre className="m-0 max-h-48 overflow-auto rounded-lg bg-surface-2 p-3 text-[13px] leading-relaxed">
            {[
              ...job.data.log,
              ...(job.data.error ? [`GALAT: ${job.data.error}`] : []),
            ].join("\n") || "…"}
          </pre>
        ) : null}
      </section>

      <section aria-labelledby="daftar-dokumen" className="flex flex-col gap-3">
        <h2 id="daftar-dokumen" className="m-0 text-lg font-semibold">
          Dokumen
        </h2>
        {docs.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : docs.isError ? (
          <p role="alert" className="text-sm text-danger">
            Daftar dokumen tidak dapat dimuat.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Status dokumen korpus dan ingesti
              </caption>
              <thead>
                <tr className="border-b border-line text-[13px] text-ink-muted">
                  {[
                    "ID",
                    "Judul",
                    "Bhs",
                    "File",
                    "Chunk",
                    "Diindeks",
                    "Boleh ke API",
                    "Catatan",
                  ].map((h) => (
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
                {docs.data.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-line last:border-0"
                    data-testid={`doc-${d.id}`}
                  >
                    <th scope="row" className="px-3 py-2.5 font-semibold">
                      {d.id}
                    </th>
                    <td className="px-3 py-2.5">{d.title}</td>
                    <td className="px-3 py-2.5">{d.lang}</td>
                    <td className="px-3 py-2.5">
                      {d.file_present
                        ? `ada (${d.sha256})`
                        : d.file
                          ? "hilang"
                          : "belum diunduh"}
                    </td>
                    <td className="px-3 py-2.5">
                      {d.ingested ? d.chunks : "—"}
                    </td>
                    <td className="px-3 py-2.5">{yesNo(d.index)}</td>
                    <td className="px-3 py-2.5">{yesNo(d.api_allowed)}</td>
                    <td className="px-3 py-2.5 text-[13px] text-ink-muted">
                      {d.note ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UploadForm
        onUploaded={() => qc.invalidateQueries({ queryKey: ["admin-docs"] })}
      />
    </>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => Promise<unknown> }) {
  const ids = {
    file: useId(),
    title: useId(),
    pub: useId(),
    lang: useId(),
    parser: useId(),
    url: useId(),
  };
  const [apiAllowed, setApiAllowed] = useState(false);
  const m = useMutation({
    mutationFn: (form: FormData) => uploadDocument(form),
    onSuccess: onUploaded,
  });
  const err =
    m.error instanceof ApiError
      ? m.error.message
      : m.error
        ? "Unggahan gagal."
        : null;
  const field = "min-h-11 border-field bg-surface text-base";
  return (
    <details
      className="rounded-2xl border border-line bg-surface p-5"
      open={false}
    >
      <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold">
        Unggah PDF baru
      </summary>
      <form
        className="mt-3 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          f.set("api_allowed", String(apiAllowed));
          m.mutate(f);
        }}
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={ids.file} className="text-sm font-semibold">
            Berkas PDF (maks. 30 MB)
          </label>
          <Input
            id={ids.file}
            name="file"
            type="file"
            accept="application/pdf"
            required
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={ids.title} className="text-sm font-semibold">
            Judul dokumen
          </label>
          <Input
            id={ids.title}
            name="title"
            required
            minLength={3}
            maxLength={300}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.pub} className="text-sm font-semibold">
            Penerbit
          </label>
          <Input
            id={ids.pub}
            name="publisher"
            required
            minLength={2}
            maxLength={200}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.url} className="text-sm font-semibold">
            URL sumber
          </label>
          <Input
            id={ids.url}
            name="source_url"
            type="url"
            maxLength={500}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.lang} className="text-sm font-semibold">
            Bahasa
          </label>
          <select
            id={ids.lang}
            name="lang"
            defaultValue="id"
            className={`${field} rounded-lg border px-3`}
          >
            <option value="id">Indonesia</option>
            <option value="en">Inggris</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.parser} className="text-sm font-semibold">
            Jenis struktur
          </label>
          <select
            id={ids.parser}
            name="parser"
            defaultValue="legal_id"
            className={`${field} rounded-lg border px-3`}
          >
            <option value="legal_id">Peraturan (BAB/Pasal/Ayat)</option>
            <option value="sections_smk2">Pedoman (BAB/Elemen)</option>
            <option value="sections_en">Bagian bernomor (Inggris)</option>
          </select>
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 sm:col-span-2">
          <input
            type="checkbox"
            checked={apiAllowed}
            onChange={(e) => setApiAllowed(e.target.checked)}
            className="mt-1 size-5 accent-[var(--k2-cite)]"
          />
          <span className="text-sm">
            <strong>Boleh dikirim ke API LLM eksternal</strong>
            <span className="block text-[13px] text-ink-muted">
              Biarkan kosong untuk dokumen internal. Hanya dokumen publik yang
              boleh dicentang.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button
            type="submit"
            disabled={m.isPending}
            className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-ink hover:bg-brand/90"
          >
            <Upload aria-hidden="true" />
            {m.isPending ? "Mengunggah…" : "Unggah"}
          </Button>
          {m.isSuccess ? (
            <span role="status" className="text-sm text-ok">
              Tersimpan sebagai {m.data.id}. Jalankan re-index agar dokumen
              terbaca.
            </span>
          ) : null}
          {err ? (
            <span role="alert" className="text-sm text-danger">
              {err}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

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

function EvalTab() {
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
