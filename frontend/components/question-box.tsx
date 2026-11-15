"use client";

import { ArrowUp, GitBranch, Loader2, Zap } from "lucide-react";
import { useId, type Ref } from "react";

import type { AskBody } from "@/lib/sse";

const MODES = [
  {
    value: "standard",
    label: "Standar",
    icon: Zap,
    hint: "Standar: cepat, mencari pasal yang paling relevan.",
  },
  {
    value: "agentic",
    label: "Agentik",
    icon: GitBranch,
    hint: "Agentik menelusuri beberapa pasal sekaligus, lebih lambat.",
  },
] as const satisfies readonly {
  value: AskBody["mode"];
  label: string;
  icon: typeof Zap;
  hint: string;
}[];

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: AskBody["mode"];
  onChange: (m: AskBody["mode"]) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Mode jawaban"
      className="inline-flex rounded-full bg-surface-2 p-0.5"
    >
      {MODES.map(({ value, label, icon: Icon, hint }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          title={hint}
          onClick={() => onChange(value)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors pointer-coarse:min-h-11 ${
            mode === value
              ? "bg-surface font-semibold text-ink shadow-sm"
              : "font-medium text-ink-muted hover:text-ink"
          }`}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

const MAX_LENGTH = 1000;
const COUNTER_FROM = 800;

export function QuestionBox({
  value,
  onChange,
  onSubmit,
  mode,
  onModeChange,
  busy = false,
  large = false,
  align = "center",
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  mode: AskBody["mode"];
  onModeChange: (m: AskBody["mode"]) => void;
  busy?: boolean;
  large?: boolean;
  align?: "center" | "start";
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const id = useId();
  const hintId = useId();
  const trimmed = value.trim().length;
  const tooShort = trimmed < 3;
  const modeHint = MODES.find((m) => m.value === mode)?.hint;
  const submit = () => {
    if (!tooShort && !busy) onSubmit();
  };
  return (
    <form
      className={`flex w-full flex-col gap-2.5 ${align === "start" ? "items-start" : "items-center"}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="relative w-full overflow-hidden rounded-3xl border-[1.5px] border-field/60 bg-surface shadow-[0_8px_24px_-8px_rgba(28,36,48,0.18)] transition-[box-shadow,border-color,transform] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-brand before:opacity-70 before:transition-all focus-within:-translate-y-px focus-within:border-cite focus-within:shadow-[0_0_0_4px_var(--k2-cite-tint),0_16px_32px_-12px_rgba(28,36,48,0.22)] focus-within:before:w-1 focus-within:before:opacity-100">
        <label htmlFor={id} className="sr-only">
          Pertanyaan Anda
        </label>
        <textarea
          id={id}
          ref={inputRef}
          rows={2}
          value={value}
          maxLength={MAX_LENGTH}
          autoComplete="off"
          aria-describedby={hintId}
          placeholder="Tulis pertanyaan Anda tentang K3 listrik"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a line; never send while an IME is composing.
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          className={`field-sizing-content block max-h-44 w-full resize-none border-0 bg-transparent px-5 pb-1 pt-4 leading-relaxed text-ink outline-none! placeholder:text-ink-muted ${
            large ? "min-h-[72px] text-lg" : "min-h-[56px] text-base"
          }`}
        />
        <div className="@container flex items-center justify-between gap-3 px-3 pb-3 pl-4">
          <ModeToggle mode={mode} onChange={onModeChange} />
          <div className="flex items-center gap-3">
            {value.length >= COUNTER_FROM ? (
              <span
                role="status"
                className="text-[13px] tabular-nums text-ink-muted"
              >
                {value.length}/{MAX_LENGTH}
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="hidden whitespace-nowrap text-[13px] text-ink-muted @lg:pointer-fine:inline"
              >
                Enter kirim · Shift+Enter baris baru
              </span>
            )}
            <button
              type="submit"
              disabled={tooShort || busy}
              aria-label={busy ? "Mencari…" : "Tanya"}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink transition-[background-color,transform,color] hover:scale-105 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-muted"
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <ArrowUp
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={2.5}
                />
              )}
            </button>
          </div>
        </div>
      </div>
      <p
        id={hintId}
        aria-live="polite"
        className="m-0 px-1 text-[13px] leading-snug text-ink-muted"
      >
        {trimmed > 0 && tooShort
          ? "Tambahkan sedikit detail agar pasalnya tepat."
          : modeHint}
      </p>
    </form>
  );
}
