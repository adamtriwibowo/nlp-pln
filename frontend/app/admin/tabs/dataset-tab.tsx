"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createQA,
  deleteQA,
  fetchCandidates,
  fetchQA,
  freezeTest,
  QA_SPLITS,
  QA_TYPES,
  updateQA,
  type Candidate,
  type QAItem,
  type QAView,
} from "@/lib/lab-api";

const TYPE_LABEL: Record<QAItem["type"], string> = {
  factual: "Faktual",
  multihop: "Lintas pasal",
  unanswerable: "Di luar korpus",
};

const errText = (e: unknown, fallback: string) =>
  e instanceof ApiError ? e.message : fallback;

export function DatasetTab() {
  const qc = useQueryClient();
  const qa = useQuery({ queryKey: ["qa"], queryFn: fetchQA });
  const [split, setSplit] = useState<"all" | QAItem["split"]>("all");
  const [type, setType] = useState<"all" | QAItem["type"]>("all");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<QAItem | "new" | null>(null);
  const [confirmFreeze, setConfirmFreeze] = useState(false);

  const setView = (v: QAView) => qc.setQueryData(["qa"], v);
  const freeze = useMutation({
    mutationFn: freezeTest,
    onSuccess: (v) => {
      setView(v);
      setConfirmFreeze(false);
    },
  });
  const del = useMutation({ mutationFn: deleteQA, onSuccess: setView });

  if (qa.isPending) return <Skeleton className="h-64 w-full" />;
  if (qa.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {errText(qa.error, "Dataset tidak dapat dimuat.")}
      </p>
    );
  }
  const view = qa.data;
  const frozen = view.frozen !== null;
  const shown = view.items.filter(
    (i) =>
      (split === "all" || i.split === split) &&
      (type === "all" || i.type === type) &&
      (text.trim() === "" ||
        `${i.id} ${i.question}`
          .toLowerCase()
          .includes(text.trim().toLowerCase())),
  );
  const pct = Math.min(
    100,
    Math.round((view.stats.total / view.stats.target_min) * 100),
  );

  return (
    <>
      <section
        aria-labelledby="ringkasan-dataset"
        data-testid="dataset-stats"
        className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
      >
        <h2 id="ringkasan-dataset" className="m-0 text-lg font-semibold">
          Dataset pertanyaan uji
        </h2>
        <p className="m-0 text-sm text-ink-muted">
          Pertanyaan, jawaban acuan, dan <code>gold_chunk_ids</code> ditulis
          oleh kelompok. Halaman ini hanya menyimpan dan memvalidasinya ke{" "}
          <code>data/eval/qa.jsonl</code>.
        </p>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span data-testid="qa-total">
              {view.stats.total} dari target minimal {view.stats.target_min}{" "}
              pertanyaan
            </span>
            <span className="text-ink-muted">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progres jumlah pertanyaan"
            aria-valuemin={0}
            aria-valuemax={view.stats.target_min}
            aria-valuenow={Math.min(view.stats.total, view.stats.target_min)}
            className="h-2.5 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full bg-cite" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            ["Dev", view.stats.by_split.dev],
            ["Test", view.stats.by_split.test],
            ["Faktual", view.stats.by_type.factual],
            ["Lintas pasal", view.stats.by_type.multihop],
            ["Di luar korpus", view.stats.by_type.unanswerable],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-[13px] text-ink-muted">{k}</dt>
              <dd className="m-0 text-xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        {frozen ? (
          <p
            data-testid="freeze-banner"
            data-integrity={view.integrity}
            className={`m-0 flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm ${
              view.integrity === "ok"
                ? "bg-ok-tint text-ok"
                : "bg-danger-tint text-danger"
            }`}
          >
            {view.integrity === "ok" ? (
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <ShieldAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            )}
            <span>
              Split test <strong>dibekukan</strong> pada{" "}
              {new Date(view.frozen!.frozen_at).toLocaleString("id-ID")} (
              {view.frozen!.n_test} item).{" "}
              {view.integrity === "ok"
                ? "Isinya utuh sejak dibekukan."
                : "PERINGATAN: isi berkas berbeda dari saat dibekukan. Periksa riwayat git."}
            </span>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm text-ink-muted">
              Bekukan split test sebelum tuning agar tidak ikut terpakai.
              Pembekuan tidak dapat dibatalkan dari halaman ini.
            </p>
            {confirmFreeze ? (
              <div
                className="flex flex-wrap items-center gap-3"
                role="group"
                aria-label="Konfirmasi pembekuan"
              >
                <span className="text-sm font-semibold">
                  Bekukan {view.stats.by_split.test} item test sekarang?
                </span>
                <Button
                  type="button"
                  data-testid="freeze-confirm"
                  disabled={freeze.isPending}
                  onClick={() => freeze.mutate()}
                  className="min-h-11 rounded-xl bg-danger px-5 font-semibold text-surface hover:bg-danger/90"
                >
                  Ya, bekukan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-xl px-5"
                  onClick={() => setConfirmFreeze(false)}
                >
                  Batal
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="freeze"
                  disabled={view.stats.by_split.test === 0}
                  onClick={() => setConfirmFreeze(true)}
                  className="min-h-11 rounded-xl px-4"
                >
                  <Lock aria-hidden="true" />
                  Bekukan split test
                </Button>
              </div>
            )}
            {freeze.isError ? (
              <p role="alert" className="m-0 text-sm text-danger">
                {errText(freeze.error, "Gagal membekukan.")}
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="daftar-qa" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="daftar-qa" className="m-0 text-lg font-semibold">
            Daftar pertanyaan ({shown.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/admin/qa/export"
              download
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-cite hover:bg-surface-2"
            >
              <Download className="size-4" aria-hidden="true" />
              Ekspor JSONL
            </a>
            <Button
              type="button"
              data-testid="add-qa"
              onClick={() => setEditing("new")}
              className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-ink hover:bg-brand/90"
            >
              <Plus aria-hidden="true" />
              Tambah pertanyaan
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label="Split"
            value={split}
            onChange={(v) => setSplit(v as typeof split)}
            options={[
              ["all", "Semua"],
              ...QA_SPLITS.map((s) => [s, s] as [string, string]),
            ]}
          />
          <FilterSelect
            label="Tipe"
            value={type}
            onChange={(v) => setType(v as typeof type)}
            options={[
              ["all", "Semua"],
              ...QA_TYPES.map((t) => [t, TYPE_LABEL[t]] as [string, string]),
            ]}
          />
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="cari-qa" className="text-[13px] font-semibold">
              Cari
            </label>
            <Input
              id="cari-qa"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ID atau kata dalam pertanyaan"
              className="min-h-11 border-field bg-surface text-base"
            />
          </div>
        </div>

        {view.items.length === 0 ? (
          <div
            data-testid="qa-empty"
            className="rounded-2xl border border-line bg-surface p-8 text-center"
          >
            <h3 className="m-0 text-lg font-semibold">Belum ada pertanyaan</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
              Klik &ldquo;Tambah pertanyaan&rdquo; untuk menulis pertanyaan
              pertama. Gunakan pencarian kandidat di formulir untuk menemukan
              pasal yang tepat sebagai gold.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <caption className="sr-only">Pertanyaan uji</caption>
              <thead>
                <tr className="border-b border-line text-[13px] text-ink-muted">
                  {["ID", "Pertanyaan", "Tipe", "Split", "Gold", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="px-3 py-2.5 font-semibold"
                      >
                        {h || <span className="sr-only">Aksi</span>}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const locked = frozen && i.split === "test";
                  return (
                    <tr
                      key={i.id}
                      data-testid={`qa-row-${i.id}`}
                      className="border-b border-line last:border-0"
                    >
                      <th scope="row" className="px-3 py-2.5 font-semibold">
                        {i.id}
                      </th>
                      <td className="max-w-md px-3 py-2.5">{i.question}</td>
                      <td className="px-3 py-2.5">{TYPE_LABEL[i.type]}</td>
                      <td className="px-3 py-2.5">
                        {i.split}
                        {locked ? (
                          <Lock
                            className="ml-1 inline size-3.5"
                            aria-label="dibekukan"
                          />
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">{i.gold_chunk_ids.length}</td>
                      <td className="px-3 py-1">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={locked}
                            title={locked ? "Split test dibekukan" : undefined}
                            aria-label={`Ubah ${i.id}`}
                            onClick={() => setEditing(i)}
                            className="min-h-11 rounded-lg px-3"
                          >
                            Ubah
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={locked || del.isPending}
                            title={locked ? "Split test dibekukan" : undefined}
                            aria-label={`Hapus ${i.id}`}
                            onClick={() => {
                              if (
                                editing !== null &&
                                editing !== "new" &&
                                editing.id === i.id
                              )
                                setEditing(null);
                              del.mutate(i.id);
                            }}
                            className="min-h-11 rounded-lg px-3 text-danger"
                          >
                            Hapus
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {del.isError ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {errText(del.error, "Gagal menghapus.")}
          </p>
        ) : null}
      </section>

      {editing !== null ? (
        <QAForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          nextId={view.next_id}
          frozen={frozen}
          onClose={() => setEditing(null)}
          onSaved={(v) => {
            setView(v);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-lg border border-field bg-surface px-3 text-base"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function QAForm({
  initial,
  nextId,
  frozen,
  onClose,
  onSaved,
}: {
  initial: QAItem | null;
  nextId: string;
  frozen: boolean;
  onClose: () => void;
  onSaved: (v: QAView) => void;
}) {
  const ids = {
    id: useId(),
    q: useId(),
    ref: useId(),
    type: useId(),
    split: useId(),
    note: useId(),
    cand: useId(),
    manual: useId(),
  };
  const [id, setId] = useState(initial?.id ?? nextId);
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [reference, setReference] = useState(initial?.reference_answer ?? "");
  const [type, setType] = useState<QAItem["type"]>(initial?.type ?? "factual");
  const [splitV, setSplitV] = useState<QAItem["split"]>(
    initial?.split ?? "dev",
  );
  const [note, setNote] = useState(initial?.source_note ?? "");
  const [gold, setGold] = useState<string[]>(initial?.gold_chunk_ids ?? []);
  const [candQuery, setCandQuery] = useState("");
  const [manual, setManual] = useState("");
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const item: QAItem = {
    id: id.trim(),
    question: question.trim(),
    reference_answer: reference.trim(),
    gold_chunk_ids: type === "unanswerable" ? [] : gold,
    type,
    split: splitV,
    source_note: note.trim(),
  };
  const save = useMutation({
    mutationFn: () => (initial ? updateQA(item) : createQA(item)),
    onSuccess: onSaved,
  });
  const blockedByFreeze = frozen && splitV === "test";

  const search = async () => {
    const q = (candQuery || question).trim();
    if (q.length < 3) {
      setSearchErr("Tulis pertanyaan atau kata kunci (min. 3 karakter) dulu.");
      return;
    }
    setSearching(true);
    setSearchErr(null);
    try {
      setCands(await fetchCandidates(q));
    } catch (e) {
      setCands(null);
      setSearchErr(errText(e, "Pencarian gagal."));
    } finally {
      setSearching(false);
    }
  };
  const addGold = (cid: string) =>
    setGold((g) => (g.includes(cid) ? g : [...g, cid]));
  const field = "min-h-11 border-field bg-surface text-base";

  return (
    <section
      aria-labelledby="form-qa"
      data-testid="qa-form"
      className="flex flex-col gap-4 rounded-2xl border-2 border-cite bg-surface p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="form-qa" className="m-0 text-lg font-semibold">
          {initial ? `Ubah ${initial.id}` : "Pertanyaan baru"}
        </h2>
        <Button
          type="button"
          variant="outline"
          aria-label="Tutup formulir"
          onClick={onClose}
          className="size-11 min-h-11 rounded-xl"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.id} className="text-sm font-semibold">
            ID
          </label>
          <Input
            id={ids.id}
            value={id}
            disabled={initial !== null}
            onChange={(e) => setId(e.target.value)}
            className={field}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.type} className="text-sm font-semibold">
              Tipe
            </label>
            <select
              id={ids.type}
              value={type}
              onChange={(e) => setType(e.target.value as QAItem["type"])}
              className={`${field} rounded-lg border px-3`}
            >
              {QA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.split} className="text-sm font-semibold">
              Split
            </label>
            <select
              id={ids.split}
              value={splitV}
              onChange={(e) => setSplitV(e.target.value as QAItem["split"])}
              className={`${field} rounded-lg border px-3`}
            >
              {QA_SPLITS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
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
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={ids.ref} className="text-sm font-semibold">
            Jawaban acuan
          </label>
          <Textarea
            id={ids.ref}
            rows={3}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="border-field bg-surface text-base"
          />
          <span className="text-[13px] text-ink-muted">
            Tulis jawaban yang benar menurut pasal sumber. Untuk pertanyaan di
            luar korpus, tulis bahwa informasinya tidak ada di dokumen.
          </span>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={ids.note} className="text-sm font-semibold">
            Catatan sumber
          </label>
          <Input
            id={ids.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="mis. Permen ESDM 10/2021 Pasal 35 ayat (1)"
            className={field}
          />
        </div>

        <fieldset
          className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:col-span-2"
          disabled={type === "unanswerable"}
        >
          <legend className="px-1 text-sm font-semibold">Chunk gold</legend>
          {type === "unanswerable" ? (
            <p className="m-0 text-sm text-ink-muted">
              Pertanyaan di luar korpus tidak memiliki chunk gold.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" data-testid="gold-list">
                {gold.length === 0 ? (
                  <span className="text-sm text-ink-muted">
                    Belum ada gold.
                  </span>
                ) : null}
                {gold.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center gap-1 rounded-full bg-cite-tint py-1 pl-3 pr-1 text-sm font-semibold text-cite"
                  >
                    {g}
                    <button
                      type="button"
                      aria-label={`Hapus gold ${g}`}
                      onClick={() => setGold((x) => x.filter((y) => y !== g))}
                      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-cite hover:text-on-cite"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                  <label
                    htmlFor={ids.cand}
                    className="text-[13px] font-semibold"
                  >
                    Cari kandidat pasal
                  </label>
                  <Input
                    id={ids.cand}
                    value={candQuery}
                    onChange={(e) => setCandQuery(e.target.value)}
                    placeholder="kosong = pakai teks pertanyaan"
                    className={field}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={searching}
                  onClick={search}
                  className="min-h-11 rounded-xl px-4"
                >
                  <Search aria-hidden="true" />
                  {searching ? "Mencari…" : "Cari kandidat"}
                </Button>
                <div className="flex w-48 flex-col gap-1.5">
                  <label
                    htmlFor={ids.manual}
                    className="text-[13px] font-semibold"
                  >
                    Atau ketik chunk_id
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id={ids.manual}
                      value={manual}
                      onChange={(e) => setManual(e.target.value)}
                      placeholder="D2-P18"
                      className={field}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Tambah chunk_id"
                      onClick={() => {
                        if (manual.trim()) {
                          addGold(manual.trim());
                          setManual("");
                        }
                      }}
                      className="size-11 min-h-11 shrink-0 rounded-lg"
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
              {searchErr ? (
                <p role="alert" className="m-0 text-sm text-danger">
                  {searchErr}
                </p>
              ) : null}
              {cands ? (
                <div className="flex flex-col gap-2">
                  <p className="m-0 text-[13px] text-ink-muted">
                    Kandidat hanya bantuan pencarian. Baca teksnya sendiri
                    sebelum menetapkannya sebagai gold.
                  </p>
                  <ul
                    data-testid="candidates"
                    className="m-0 flex list-none flex-col gap-2 p-0"
                  >
                    {cands.map((c) => (
                      <li
                        key={c.chunk_id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-surface-2 p-3"
                      >
                        <div className="min-w-0 flex-[1_1_300px]">
                          <p className="m-0 text-sm font-semibold">
                            {c.rank}. {c.chunk_id}{" "}
                            <span className="font-normal text-ink-muted">
                              · {c.ref} · hlm. {c.page_start}
                            </span>
                          </p>
                          <p className="m-0 mt-1 line-clamp-3 text-[13px] leading-snug">
                            {c.snippet}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={gold.includes(c.chunk_id)}
                          onClick={() => addGold(c.chunk_id)}
                          className="min-h-11 rounded-lg px-3 text-sm"
                        >
                          {gold.includes(c.chunk_id)
                            ? "Dipilih"
                            : "Jadikan gold"}
                        </Button>
                      </li>
                    ))}
                    {cands.length === 0 ? (
                      <li className="text-sm text-ink-muted">
                        Tidak ada kandidat.
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button
            type="submit"
            data-testid="save-qa"
            disabled={save.isPending || blockedByFreeze}
            className="min-h-11 rounded-xl bg-brand px-6 font-semibold text-brand-ink hover:bg-brand/90"
          >
            {save.isPending
              ? "Menyimpan…"
              : initial
                ? "Simpan perubahan"
                : "Simpan pertanyaan"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-11 rounded-xl px-5"
          >
            Batal
          </Button>
          {blockedByFreeze ? (
            <span role="status" className="text-sm text-danger">
              Split test dibekukan: item test tidak dapat ditambah atau diubah.
            </span>
          ) : null}
          {save.isError ? (
            <span
              role="alert"
              data-testid="qa-error"
              className="text-sm text-danger"
            >
              {errText(save.error, "Gagal menyimpan.")}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
