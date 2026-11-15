"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AnswerAnatomy } from "@/components/answer-anatomy";
import { Disclaimer } from "@/components/disclaimer";
import {
  CorpusChips,
  ExampleQuestions,
  HowItWorks,
} from "@/components/home-sections";
import { QuestionBox } from "@/components/question-box";
import type { AskBody } from "@/lib/sse";

export default function Home() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<AskBody["mode"]>("standard");

  const go = (q: string, m: AskBody["mode"] = mode) =>
    router.push(`/tanya?q=${encodeURIComponent(q.trim())}&mode=${m}`);

  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-label="Tanya jawab"
        className="hero-glow border-b border-line"
      >
        <div className="mx-auto grid w-full max-w-[1160px] items-center gap-12 px-6 pb-14 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14 lg:pb-20 lg:pt-20">
          <div className="flex flex-col items-start gap-6">
            <h1 className="m-0 max-w-[640px] text-balance font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[56px]">
              Tanya aturan K3 listrik, lengkap dengan pasalnya
            </h1>
            <p className="m-0 max-w-[560px] text-lg leading-relaxed text-ink-muted">
              Jawaban hanya dari dokumen resmi ketenagalistrikan. Setiap klaim
              menunjuk pasal dan halaman yang bisa Anda cek langsung di PDF.
            </p>
            <QuestionBox
              large
              align="start"
              value={question}
              onChange={setQuestion}
              onSubmit={() => go(question)}
              mode={mode}
              onModeChange={setMode}
            />
            <ExampleQuestions onPick={(q) => go(q)} />
          </div>
          <div className="hidden w-full lg:block">
            <AnswerAnatomy />
          </div>
        </div>
      </section>
      <HowItWorks />
      <CorpusChips />
      <div className="mt-auto flex justify-center px-6 pb-10">
        <Disclaimer className="text-center" />
      </div>
    </main>
  );
}
