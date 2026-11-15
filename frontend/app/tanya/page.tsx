import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata = { title: "Jawaban — K2-RAG" };

async function Forward({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string }>;
}) {
  const { q, mode } = await searchParams;
  const next = new URLSearchParams();
  if (q) next.set("q", q);
  if (mode === "agentic") next.set("mode", mode);
  return redirect(next.size ? `/?${next.toString()}` : "/");
}

/** Old answer URLs (/tanya?q=...&mode=...) now open the chat, which starts that question. */
export default function TanyaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Forward searchParams={searchParams} />
    </Suspense>
  );
}
