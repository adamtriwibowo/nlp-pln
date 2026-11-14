import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata = { title: "Masuk — K2-RAG" };

export default function MasukPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-heading text-3xl font-bold tracking-tight">
          Masuk
        </h1>
        <p className="m-0 text-ink-muted">
          Untuk penilai ahli dan admin kelompok. Pengguna umum tidak perlu masuk
          untuk bertanya.
        </p>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
