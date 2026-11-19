"use client";

import { Check, Copy, RotateCcw, Zap } from "lucide-react";
import { useState } from "react";

import { AgentSteps } from "@/components/agent-steps";
import { AnswerView } from "@/components/answer-view";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { FeedbackBar } from "@/components/feedback-bar";
import { SourceCard } from "@/components/source-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorAdvice } from "@/lib/answer";
import type { Citation } from "@/lib/api";
import type { AgentStep, AskBody } from "@/lib/sse";
import type { FinishedAnswer } from "@/lib/use-ask";

export function UserBubble({
  text,
  mode,
}: {
  text: string;
  mode: AskBody["mode"];
}) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[88%] flex-col items-end gap-1 sm:max-w-[80%]">
        <p
          data-testid="user-message"
          className="m-0 whitespace-pre-line rounded-3xl rounded-br-lg bg-surface-2 px-5 py-3 text-[17px] leading-relaxed"
        >
          {text}
        </p>
        {mode === "agentic" ? (
          <span className="px-2 text-[13px] text-ink-muted">Mode Agentik</span>
        ) : null}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink"
    >
      <Zap className="size-4" />
    </span>
  );
}

function AssistantFrame({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <article aria-label={label} className="flex gap-3.5">
      <Avatar />
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </article>
  );
}

/** A finished answer: badge, text with source chips, source list, feedback. */
export function AssistantTurn({
  turn,
  activeLabel,
  onSelect,
}: {
  turn: FinishedAnswer;
  activeLabel: number | null;
  onSelect: (label: number) => void;
}) {
  return (
    <AssistantFrame label="Jawaban K2-RAG">
      <div className="flex flex-wrap items-center gap-2.5">
        <ConfidenceBadge badge={turn.meta.badge} />
      </div>
      {turn.mode === "agentic" ? (
        <AgentSteps steps={turn.steps} running={false} />
      ) : null}
      <AnswerView
        text={turn.answer}
        citations={turn.citations}
        activeLabel={activeLabel}
        onSelect={onSelect}
        streaming={false}
      />
      {turn.meta.abstained ? (
        <p className="m-0 rounded-xl bg-warn-tint px-3.5 py-2.5 text-sm text-warn">
          Sistem memilih tidak menjawab karena bukti di dokumen belum cukup.
          Coba rumuskan pertanyaan dengan istilah yang dipakai dalam peraturan,
          atau rujuk dokumen aslinya.
        </p>
      ) : null}
      {turn.citations.length > 0 ? (
        <section aria-label="Sumber" className="flex flex-col gap-2.5">
          <h3 className="m-0 text-sm font-semibold text-ink-muted">
            Sumber ({turn.citations.length})
          </h3>
          {turn.citations.map((c: Citation) => (
            <SourceCard
              key={`${c.label}-${c.chunk_id}`}
              citation={c}
              active={activeLabel === c.label}
              onOpen={() => onSelect(c.label)}
            />
          ))}
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CopyAnswer turn={turn} />
        <FeedbackBar key={turn.meta.query_id} queryId={turn.meta.query_id} />
      </div>
    </AssistantFrame>
  );
}

/** Copies the answer with its sources as plain text (article, document and page per citation). */
function CopyAnswer({ turn }: { turn: FinishedAnswer }) {
  const [copied, setCopied] = useState(false);
  const text = [
    turn.answer,
    ...(turn.citations.length
      ? [
          "",
          "Sumber:",
          ...turn.citations.map(
            (c) =>
              `[${c.label}] ${c.ref}${c.doc_title ? `, ${c.doc_title}` : ""}${
                c.page_start ? `, hlm. ${c.page_start}` : ""
              }`,
          ),
        ]
      : []),
  ].join("\n");
  return (
    <Button
      type="button"
      variant="outline"
      data-testid="copy-answer"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked (insecure context): nothing to confirm */
        }
      }}
      className="min-h-11 rounded-xl px-4 text-sm"
    >
      {copied ? (
        <Check aria-hidden="true" className="text-ok" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      {copied ? "Tersalin" : "Salin jawaban"}
    </Button>
  );
}

/** The answer that is being produced right now (or failed). */
export function LiveTurn({
  mode,
  partial,
  steps,
  error,
  onRetry,
  onSelect,
}: {
  mode: AskBody["mode"];
  partial: string;
  steps: AgentStep[];
  error: { message: string; httpStatus?: number } | null;
  onRetry: () => void;
  onSelect: (label: number) => void;
}) {
  return (
    <AssistantFrame label="Jawaban K2-RAG">
      {mode === "agentic" && !error ? (
        <AgentSteps steps={steps} running />
      ) : null}
      {error ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="m-0 font-semibold text-danger">
            Jawaban belum dapat ditampilkan
          </p>
          <p className="m-0 text-sm">
            {errorAdvice(error.httpStatus, error.message)}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl px-4"
              onClick={onRetry}
            >
              <RotateCcw aria-hidden="true" />
              Coba lagi
            </Button>
          </div>
        </div>
      ) : partial ? (
        <AnswerView
          text={partial}
          citations={[]}
          activeLabel={null}
          onSelect={onSelect}
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
      )}
    </AssistantFrame>
  );
}
