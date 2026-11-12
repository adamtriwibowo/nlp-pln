"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const Health = z.object({ status: z.string(), db: z.string() });
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8010";

export function HealthStatus() {
  const { data, error, isPending } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/health`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Health.parse(await r.json());
    },
  });
  if (isPending) return <p role="status">Memeriksa server…</p>;
  if (error)
    return (
      <p role="alert" style={{ color: "var(--error)" }}>
        API tidak dapat dihubungi. Jalankan backend (make dev) lalu muat ulang.
      </p>
    );
  return (
    <p role="status" style={{ color: "var(--ok)" }}>
      API: {data.status} · DB: {data.db}
    </p>
  );
}
