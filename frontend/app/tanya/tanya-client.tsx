"use client";

import { RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentSteps } from "@/components/agent-steps";
import { AnswerView } from "@/components/answer-view";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Disclaimer } from "@/components/disclaimer";
import { FeedbackBar } from "@/components/feedback-bar";
import { QuestionBox } from "@/components/question-box";
import { SourceCard } from "@/components/source-card";
import { SourcePanel } from "@/components/source-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorAdvice } from "@/lib/answer";
import { useHistory } from "@/lib/history";
import type { AskBody } from "@/lib/sse";
import { useAsk, type FinishedAnswer } from "@/lib/use-ask";
import { useMediaQuery } from "@/lib/use-media-query";

export function TanyaClient() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const mode: AskBody["mode"] =
    params.get("mode") === "agentic" ? "agentic" : "standard";

  const history = useHistory();
  const onFinished = useCallback(
    (a: FinishedAnswer) => history.add(a),
    [history],
  );
  const { state, partial, run, restore } = useAsk(onFinished);

  const [draft, setDraft] = useState(q);
  const [draftMode, setDraftMode] = useState<AskBody["mode"]>(mode);
  const [active, setActive] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const started = useRef<string>("");

  // Start (or restore from this session's history) whenever the URL question changes.
  useEffect(() => {
    if (q.length < 3) return;
    const key = `${mode}|${q}`;
    if (started.current === key) return;
    started.current = key;
    setActive(null);
    setSheetOpen(false);
    setDraft(q);
    setDraftMode(mode);
    const cached = history.items.find(
      (h) => h.question === q && h.mode === mode,
    );
    if (cached) restore(cached);
    else void run(q, mode);
  }, [q, mode, run, restore, history.items]);

  const ask = (question: string, m: AskBody["mode"]) =>
    router.replace(`/tanya?q=${encodeURIComponent(question.trim())}&mode=${m}`);

  const citations = state.status === "done" ? state.citations : [];
  const activeCitation = citations.find((c) => c.label === active) ?? null;
  const select = (label: number) => {
    setActive(label);
    if (!desktop) setSheetOpen(true);
  };
  const busy = state.status === "loading";

  if (q.length < 3) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-6 px-6 py-16">
        <h1 className="text-center font-heading text-3xl font-bold">
          Tulis pertanyaan Anda
        </h1>
        <QuestionBox
          value={draft}
          onChange={setDraft}
          onSubmit={() => ask(draft, draftMode)}
          mode={draftMode}
          onModeChange={setDraftMode}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-wrap items-start gap-8 px-4 py-6 sm:px-8 lg:px-12">
      <section
        aria-label="Jawaban"
        className="flex min-w-0 flex-[1_1_520px] flex-col gap-5"
      >
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-6 py-5">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Pertanyaan Anda
          </span>
          <h1 className="m-0 font-heading text-2xl font-semibold leading-snug tracking-tight">
            {q}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {state.status === "done" ? (
            <ConfidenceBadge badge={state.meta.badge} />
          ) : null}
          <span className="text-[13px] text-ink-muted">
            Mode {mode === "agentic" ? "Agentik" : "Standar"}
          </span>
        </div>

        {mode === "agentic" &&
        (state.status === "loading" || state.status === "done") ? (
          <AgentSteps
            steps={state.steps}
            running={state.status === "loading"}
          />
        ) : null}

        <article
          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm"
          aria-label="Isi jawaban"
        >
          {state.status === "loading" ? (
            partial ? (
              <AnswerView
                text={partial}
                citations={[]}
                activeLabel={null}
                onSelect={select}
                streaming
              />
            ) : (
              <div
                role="status"
                aria-label="Mencari jawaban"
                className="flex flex-col gap-3"
              >
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/4" />
                <p className="m-0 text-sm text-ink-muted">
                  {mode === "agentic"
                    ? "Menelusuri beberapa pasal… ini bisa memakan waktu hingga 30 detik."
                    : "Mencari pasal yang relevan…"}
                </p>
              </div>
            )
          ) : null}

          {state.status === "done" ? (
            <>
              <AnswerView
                text={state.answer}
                citations={state.citations}
                activeLabel={active}
                onSelect={select}
                streaming={false}
              />
              {state.meta.abstained ? (
                <p className="m-0 rounded-lg bg-warn-tint px-3.5 py-2.5 text-sm text-warn">
                  Sistem memilih tidak menjawab karena bukti di dokumen belum
                  cukup. Coba rumuskan pertanyaan dengan istilah yang dipakai
                  dalam peraturan, atau rujuk dokumen aslinya.
                </p>
              ) : null}
            </>
          ) : null}

          {state.status === "error" ? (
            <div role="alert" className="flex flex-col gap-3">
              <p className="m-0 font-semibold text-danger">
                Jawaban belum dapat ditampilkan
              </p>
              <p className="m-0 text-sm">
                {errorAdvice(state.httpStatus, state.message)}
              </p>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-xl px-4"
                  onClick={() => {
                    started.current = "";
                    void run(q, mode);
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  Coba lagi
                </Button>
              </div>
            </div>
          ) : null}
        </article>

        {state.status === "done" && state.citations.length > 0 ? (
          <section aria-labelledby="sumber" className="flex flex-col gap-3">
            <h2
              id="sumber"
              className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
            >
              Sumber
            </h2>
            {state.citations.map((c) => (
              <SourceCard
                key={`${c.label}-${c.chunk_id}`}
                citation={c}
                active={active === c.label}
                onOpen={() => select(c.label)}
              />
            ))}
          </section>
        ) : null}

        {state.status === "done" ? (
          <FeedbackBar
            key={state.meta.query_id}
            queryId={state.meta.query_id}
          />
        ) : null}

        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Tanya lagi
          </h2>
          <QuestionBox
            value={draft}
            onChange={setDraft}
            onSubmit={() => ask(draft, draftMode)}
            mode={draftMode}
            onModeChange={setDraftMode}
            busy={busy}
          />
        </div>

        {history.items.length > 1 ? (
          <details className="rounded-xl border border-line bg-surface px-4 py-2">
            <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-semibold">
              Riwayat sesi ({history.items.length})
            </summary>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 pb-2">
              {history.items.map((h) => (
                <li key={`${h.mode}|${h.question}`}>
                  <button
                    type="button"
                    onClick={() => ask(h.question, h.mode)}
                    className="min-h-11 w-full cursor-pointer rounded-lg px-2 text-left text-sm text-cite hover:underline"
                  >
                    {h.question}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <Disclaimer />
      </section>

      {desktop ? (
        <aside
          aria-label="Panel sumber"
          className="sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-0 flex-[1_1_440px] flex-col overflow-y-auto rounded-2xl border border-line bg-surface shadow-md"
        >
          <SourcePanel citation={activeCitation} />
        </aside>
      ) : (
        <BottomSheet
          open={sheetOpen && activeCitation !== null}
          onClose={() => setSheetOpen(false)}
          label="Panel sumber"
        >
          <SourcePanel
            citation={activeCitation}
            onClose={() => setSheetOpen(false)}
          />
        </BottomSheet>
      )}
    </main>
  );
}
