"use client";

import { Fragment } from "react";

import type { Citation } from "@/lib/api";
import { parseAnswer } from "@/lib/answer";

/** Answer text with [n] markers rendered as focusable source chips (after sources are known). */
export function AnswerView({
  text,
  citations,
  activeLabel,
  onSelect,
  streaming,
}: {
  text: string;
  citations: Citation[];
  activeLabel: number | null;
  onSelect: (label: number) => void;
  streaming: boolean;
}) {
  const known = new Set(citations.map((c) => c.label));
  return (
    <div
      data-testid="answer"
      aria-live={streaming ? "polite" : "off"}
      aria-busy={streaming}
      className="flex flex-col gap-3 text-[17px] leading-[1.7]"
    >
      {text.split("\n").map((line, i) => (
        <p key={i} className="m-0">
          {parseAnswer(line).map((part, j) =>
            part.kind === "text" ? (
              <Fragment key={j}>{part.text}</Fragment>
            ) : (
              <Fragment key={j}>
                {part.labels.map((n) =>
                  known.has(n) ? (
                    <button
                      key={n}
                      type="button"
                      data-testid={`cite-${n}`}
                      aria-label={`Sumber ${n}`}
                      aria-pressed={activeLabel === n}
                      onClick={() => onSelect(n)}
                      className={`relative mx-0.5 inline-flex min-h-7 min-w-7 cursor-pointer items-center justify-center rounded-lg px-1.5 align-baseline text-[13px] font-semibold transition-colors after:absolute after:-inset-2 after:content-[''] ${
                        activeLabel === n
                          ? "bg-cite text-on-cite"
                          : "bg-cite-tint text-cite hover:bg-cite hover:text-on-cite"
                      }`}
                    >
                      {n}
                    </button>
                  ) : (
                    <span
                      key={n}
                      className="mx-0.5 text-[13px] font-semibold text-ink-muted"
                    >
                      [{n}]
                    </span>
                  ),
                )}
              </Fragment>
            ),
          )}
          {streaming && i === text.split("\n").length - 1 ? (
            <span
              className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-ink align-middle"
              aria-hidden="true"
            />
          ) : null}
        </p>
      ))}
    </div>
  );
}
