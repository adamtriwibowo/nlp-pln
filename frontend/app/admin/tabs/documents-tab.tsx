"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Upload } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { JobBox, isRunning, useJobPolling } from "@/components/job-box";
import {
  ApiError,
  fetchAdminDocs,
  startReindex,
  updateDocFlags,
  uploadDocument,
  type AdminDoc,
  type DocFlags,
} from "@/lib/api";

type FlagName = keyof DocFlags;
type PendingChange = { id: string; flag: FlagName; value: boolean };

const yesNo = (v: boolean) => (v ? "ya" : "tidak");

const FLAG_LABEL: Record<FlagName, string> = {
  index: "Diindeks",
  api_allowed: "Boleh ke API",
};

/** What a flag change means, shown before the admin confirms it. */
function consequence(flag: FlagName, value: boolean): string {
  if (flag === "api_allowed")
    return value
      ? "Teks dokumen ini boleh dikirim ke LLM eksternal (OpenRouter)."
      : "Teks dokumen ini tidak akan dikirim ke LLM eksternal lagi. Berlaku segera.";
  return value
    ? "Dokumen dipecah menjadi chunk dan masuk ke pencarian."
    : "Chunk dokumen ini dihapus dari pencarian.";
}

export function DocumentsTab() {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ["admin-docs"], queryFn: fetchAdminDocs });
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const reindex = useMutation({
    mutationFn: (docId?: string) => startReindex(docId),
    onSuccess: (job) => setJobId(job.id),
  });
  const change = useMutation({
    mutationFn: (c: PendingChange) =>
      updateDocFlags(c.id, { [c.flag]: c.value }),
    onSuccess: (job) => {
      setPending(null);
      setJobId(job.id);
      void qc.invalidateQueries({ queryKey: ["admin-docs"] });
    },
  });
  const job = useJobPolling(jobId);
  const running = reindex.isPending || change.isPending || isRunning(job.data);

  // the table shows chunk counts and reports, which change once a job finishes
  const finished = job.data?.status;
  useEffect(() => {
    if (finished === "done" || finished === "failed")
      void qc.invalidateQueries({ queryKey: ["admin-docs"] });
  }, [finished, qc]);

  const errorOf = (e: unknown, fallback: string) =>
    e instanceof ApiError ? e.message : e ? fallback : null;
  const reindexError = errorOf(reindex.error, "Gagal memulai reindex.");
  const changeError = errorOf(change.error, "Perubahan gagal disimpan.");

  return (
    <>
      <section
        aria-labelledby="reindex"
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
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
            onClick={() => reindex.mutate(undefined)}
            data-testid="reindex"
            className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-brand-ink hover:bg-brand/90"
          >
            <RefreshCw
              aria-hidden="true"
              className={running ? "animate-spin" : ""}
            />
            {running ? "Sedang berjalan…" : "Mulai re-index"}
          </Button>
        </div>
        {reindexError ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {reindexError}
          </p>
        ) : null}
        {job.data ? <JobBox job={job.data} /> : null}
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
          <>
            {changeError ? (
              <p role="alert" className="m-0 text-sm text-danger">
                {changeError}
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Status dokumen korpus dan ingesti
                </caption>
                <thead>
                  <tr className="border-b border-line text-[13px] text-ink-muted">
                    {[
                      "ID",
                      "Judul",
                      "File",
                      "Ingesti",
                      "Diindeks",
                      "Boleh ke API",
                      "Aksi",
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
                    <DocRow
                      key={d.id}
                      doc={d}
                      busy={running}
                      pending={pending?.id === d.id ? pending : null}
                      saving={change.isPending}
                      onAsk={setPending}
                      onCancel={() => {
                        setPending(null);
                        change.reset();
                      }}
                      onConfirm={(c) => change.mutate(c)}
                      onReindex={() => reindex.mutate(d.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <UploadForm
        onUploaded={() => qc.invalidateQueries({ queryKey: ["admin-docs"] })}
      />
    </>
  );
}

function DocRow({
  doc: d,
  busy,
  pending,
  saving,
  onAsk,
  onCancel,
  onConfirm,
  onReindex,
}: {
  doc: AdminDoc;
  busy: boolean;
  pending: PendingChange | null;
  saving: boolean;
  onAsk: (c: PendingChange) => void;
  onCancel: () => void;
  onConfirm: (c: PendingChange) => void;
  onReindex: () => void;
}) {
  const r = d.report;
  const cell = "px-3 py-2.5 align-top";
  return (
    <tr
      className="border-b border-line last:border-0"
      data-testid={`doc-${d.id}`}
    >
      <th scope="row" className={`${cell} font-semibold`}>
        {d.id}
      </th>
      <td className={cell}>
        {d.title}
        {d.note ? (
          <span className="mt-1 block text-[13px] text-ink-muted">
            {d.note}
          </span>
        ) : null}
      </td>
      <td className={cell}>
        <span className="font-mono text-[13px]">
          {d.file_present
            ? `ada (${d.sha256})`
            : d.file
              ? "hilang"
              : "belum diunduh"}
        </span>
      </td>
      <td className={cell} data-testid={`ingest-${d.id}`}>
        {d.ingested ? (
          <>
            {d.chunks} chunk
            {r ? <ReportDetail report={r} /> : null}
          </>
        ) : (
          "—"
        )}
      </td>
      {(["index", "api_allowed"] as const).map((flag) => (
        <td key={flag} className={cell}>
          <FlagControl
            doc={d}
            flag={flag}
            busy={busy}
            pending={pending?.flag === flag ? pending : null}
            saving={saving}
            onAsk={onAsk}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        </td>
      ))}
      <td className={cell}>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !d.file_present}
          onClick={onReindex}
          data-testid={`reindex-${d.id}`}
          aria-label={`Re-index ${d.id}`}
          className="min-h-9 rounded-lg border-field px-3 text-[13px] pointer-coarse:min-h-11"
        >
          <RefreshCw aria-hidden="true" />
          Re-index
        </Button>
      </td>
    </tr>
  );
}

function FlagControl({
  doc: d,
  flag,
  busy,
  pending,
  saving,
  onAsk,
  onCancel,
  onConfirm,
}: {
  doc: AdminDoc;
  flag: FlagName;
  busy: boolean;
  pending: PendingChange | null;
  saving: boolean;
  onAsk: (c: PendingChange) => void;
  onCancel: () => void;
  onConfirm: (c: PendingChange) => void;
}) {
  const current = d[flag];
  const next = !current;
  const changed = d.overridden.includes(flag);
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span data-testid={`flag-${d.id}-${flag}`}>
        {yesNo(current)}
        {changed ? (
          <span className="ml-1.5 text-[13px] text-ink-muted">(diubah)</span>
        ) : null}
      </span>
      {pending ? (
        <div
          role="group"
          aria-label={`Konfirmasi ${FLAG_LABEL[flag]} ${d.id}`}
          className="flex max-w-56 flex-col gap-2 rounded-lg border border-line bg-surface-2 p-3"
        >
          <p className="m-0 text-[13px] leading-snug">
            Ubah <strong>{FLAG_LABEL[flag]}</strong> {d.id} menjadi{" "}
            <strong>{yesNo(next)}</strong>? {consequence(flag, next)} Dokumen
            diproses ulang.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={saving}
              onClick={() => onConfirm(pending)}
              data-testid={`confirm-${d.id}-${flag}`}
              className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-brand-ink hover:bg-brand/90"
            >
              {saving ? "Menyimpan…" : "Ya, ubah"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onCancel}
              className="min-h-9 rounded-lg border-field px-3 text-[13px] pointer-coarse:min-h-11"
            >
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onAsk({ id: d.id, flag, value: next })}
          data-testid={`toggle-${d.id}-${flag}`}
          aria-label={`Jadikan ${yesNo(next)}: ${FLAG_LABEL[flag]} ${d.id}`}
          className="min-h-9 rounded-lg border-field px-3 text-[13px] pointer-coarse:min-h-11"
        >
          Jadikan {yesNo(next)}
        </Button>
      )}
    </div>
  );
}

function ReportDetail({
  report: r,
}: {
  report: NonNullable<AdminDoc["report"]>;
}) {
  const rows: [string, string][] = [
    ["Halaman", `${r.pages} (tanpa teks: ${r.empty_pages})`],
    ["Ekstraksi", r.strategy || "—"],
    ["Pasal terdeteksi", String(r.pasal_count)],
    [
      "Celah nomor pasal",
      r.pasal_gaps.length ? r.pasal_gaps.join(", ") : "tidak ada",
    ],
    [
      "Token chunk (min/median/maks)",
      `${r.tokens_min}/${r.tokens_median}/${r.tokens_max}`,
    ],
    ["Chunk di atas 600 token", String(r.over_budget)],
  ];
  return (
    <details className="mt-1 text-[13px]">
      <summary className="min-h-6 cursor-pointer text-cite underline-offset-2 hover:underline">
        Detail ingesti
      </summary>
      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="m-0">{v}</dd>
          </div>
        ))}
      </dl>
      {r.skipped_pasal_like.length ? (
        <p className="m-0 mt-2 text-ink-muted">
          Baris mirip judul pasal yang ditolak: {r.skipped_pasal_like.length}.
          Contoh: {r.skipped_pasal_like.slice(0, 3).join(" | ")}
        </p>
      ) : null}
    </details>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => Promise<unknown> }) {
  const ids = {
    file: useId(),
    title: useId(),
    pub: useId(),
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
      className="rounded-xl border border-line bg-surface p-5"
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
            Berkas PDF berbahasa Indonesia (maks. 30 MB)
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
        <input type="hidden" name="lang" value="id" />
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
            className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-brand-ink hover:bg-brand/90"
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
