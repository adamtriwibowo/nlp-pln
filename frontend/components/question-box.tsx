"use client";

import { ArrowRight } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import type { AskBody } from "@/lib/sse";

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: AskBody["mode"];
  onChange: (m: AskBody["mode"]) => void;
}) {
  const opt = (value: AskBody["mode"], label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={mode === value}
      onClick={() => onChange(value)}
      className={`min-h-11 rounded-full px-5 text-sm transition-colors ${
        mode === value
          ? "bg-surface font-semibold text-ink shadow-sm"
          : "font-medium text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Mode jawaban"
      className="inline-flex rounded-full bg-surface-2 p-1"
    >
      {opt("standard", "Standar")}
      {opt("agentic", "Agentik")}
    </div>
  );
}

export function QuestionBox({
  value,
  onChange,
  onSubmit,
  mode,
  onModeChange,
  busy = false,
  large = false,
  align = "center",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  mode: AskBody["mode"];
  onModeChange: (m: AskBody["mode"]) => void;
  busy?: boolean;
  large?: boolean;
  align?: "center" | "start";
}) {
  const id = useId();
  const tooShort = value.trim().length < 3;
  return (
    <form
      className={`flex w-full flex-col gap-4 ${align === "start" ? "items-start" : "items-center"}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort && !busy) onSubmit();
      }}
    >
      <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-[0_1px_2px_rgba(28,36,48,0.06),0_12px_32px_rgba(28,36,48,0.08)] transition-shadow focus-within:border-cite focus-within:shadow-[0_0_0_3px_var(--k2-cite-tint),0_12px_32px_rgba(28,36,48,0.1)]">
        <label htmlFor={id} className="sr-only">
          Pertanyaan Anda
        </label>
        <input
          id={id}
          type="text"
          value={value}
          maxLength={1000}
          autoComplete="off"
          placeholder="Tulis pertanyaan Anda tentang K3 listrik"
          onChange={(e) => onChange(e.target.value)}
          className={`min-h-[52px] min-w-0 flex-1 basis-64 rounded-xl border-0 bg-transparent px-4 text-ink outline-offset-0 placeholder:text-ink-muted ${
            large ? "text-lg" : "text-base"
          }`}
        />
        <Button
          type="submit"
          disabled={tooShort || busy}
          className="min-h-[52px] rounded-xl bg-brand px-6 text-base font-semibold text-brand-ink hover:bg-brand/90"
        >
          {busy ? "Mencari…" : "Tanya"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      <div
        className={`flex flex-wrap items-center gap-3 text-sm text-ink-muted ${align === "start" ? "justify-start" : "justify-center"}`}
      >
        <span>Mode jawaban</span>
        <ModeToggle mode={mode} onChange={onModeChange} />
        <span className="text-[13px]">
          {mode === "agentic"
            ? "Agentik menelusuri beberapa pasal sekaligus, lebih lambat."
            : "Standar: cepat, mencari pasal yang paling relevan."}
        </span>
      </div>
    </form>
  );
}
