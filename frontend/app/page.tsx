import { Suspense } from "react";

import { ChatApp } from "@/components/chat/chat-app";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex h-dvh flex-1 flex-col items-center justify-center gap-4 p-8">
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-28 w-full max-w-xl" />
        </main>
      }
    >
      <ChatApp />
    </Suspense>
  );
}
