import { HealthStatus } from "@/components/health-status";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold">K2-RAG</h1>
      <p style={{ color: "var(--muted)" }}>
        Tanya aturan K3 listrik — lengkap dengan pasalnya. (Fase 0: kerangka
        dasar.)
      </p>
      <HealthStatus />
    </main>
  );
}
