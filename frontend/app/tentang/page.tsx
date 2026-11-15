import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { AnswerAnatomy } from "@/components/answer-anatomy";
import { Disclaimer } from "@/components/disclaimer";
import { CorpusChips, HowItWorks } from "@/components/home-sections";

export const metadata = { title: "Cara kerja dan dokumen — K2-RAG" };

export default function TentangPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-label="Tentang K2-RAG"
        className="hero-glow border-b border-line"
      >
        <div className="mx-auto grid w-full max-w-[1160px] items-center gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-16">
          <div className="flex flex-col items-start gap-5">
            <h1 className="m-0 max-w-[620px] text-balance font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Jawaban K3 listrik yang bisa Anda periksa sendiri
            </h1>
            <p className="m-0 max-w-[560px] text-lg leading-relaxed text-ink-muted">
              K2-RAG menjawab dari dokumen resmi ketenagalistrikan dan
              menunjukkan pasal serta halaman PDF yang dikutip. Bila bukti tidak
              cukup, sistem menolak menjawab.
            </p>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-brand-ink no-underline transition-transform hover:scale-[1.02]"
            >
              Mulai bertanya
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="hidden lg:block">
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
