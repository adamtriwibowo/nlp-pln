"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Upload } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  fetchAdminDocs,
  fetchJob,
  startReindex,
  uploadDocument,
} from "@/lib/api";

const yesNo = (v: boolean) => (v ? "ya" : "tidak");

export function DocumentsTab() {
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
