import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { TanyaClient } from "./tanya-client";

export const metadata = { title: "Jawaban — K2-RAG" };

export default function TanyaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 flex-col gap-4 p-8">
          <Skeleton className="h-24 w-full max-w-3xl" />
          <Skeleton className="h-64 w-full max-w-3xl" />
        </main>
      }
    >
      <TanyaClient />
    </Suspense>
  );
}
