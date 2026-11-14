"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Disclaimer } from "@/components/disclaimer";
import {
  CorpusChips,
  ExampleQuestions,
  TrustRow,
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
      <div className="flex flex-1 flex-col items-center px-6 pb-6 pt-12 sm:pt-16">
        <div className="flex w-full max-w-[820px] flex-col items-center gap-6">
          <h1 className="max-w-[760px] text-balance text-center font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Tanya aturan K3 listrik, lengkap dengan pasalnya
          </h1>
          <p className="max-w-[640px] text-center text-lg leading-relaxed text-ink-muted">
            Jawaban hanya dari dokumen resmi ketenagalistrikan. Setiap klaim
            menunjuk pasal dan halaman yang bisa Anda cek langsung di PDF.
          </p>
          <QuestionBox
            large
            value={question}
            onChange={setQuestion}
            onSubmit={() => go(question)}
            mode={mode}
            onModeChange={setMode}
          />
          <ExampleQuestions onPick={(q) => go(q)} />
          <TrustRow />
        </div>
      </div>
      <CorpusChips />
      <div className="flex justify-center px-6 pb-10">
        <Disclaimer className="text-center" />
      </div>
    </main>
  );
}
