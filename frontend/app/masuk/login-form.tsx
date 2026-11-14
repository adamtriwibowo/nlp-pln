"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, login } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const tokenId = useId();
  const nameId = useId();
  const m = useMutation({
    mutationFn: () => login(token, name.trim() || undefined),
    onSuccess: async (me) => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      const next = params.get("next");
      router.replace(
        next && next.startsWith("/")
          ? next
          : me.role === "admin"
            ? "/admin"
            : "/review",
      );
    },
  });
  const message =
    m.error instanceof ApiError
      ? m.error.message
      : m.error
        ? "Tidak dapat menghubungi server."
        : null;

  return (
    <form
      className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={tokenId} className="text-sm font-semibold">
          Token akses
        </label>
        <Input
          id={tokenId}
          type="password"
          autoComplete="current-password"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="min-h-11 border-field bg-surface text-base"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-sm font-semibold">
          Nama penilai
        </label>
        <Input
          id={nameId}
          type="text"
          autoComplete="name"
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-describedby={`${nameId}-hint`}
          className="min-h-11 border-field bg-surface text-base"
        />
        <span id={`${nameId}-hint`} className="text-[13px] text-ink-muted">
          Wajib untuk penilai ahli (penilaian dicatat atas nama ini). Admin
          boleh mengosongkan.
        </span>
      </div>
      {message ? (
        <p
          role="alert"
          className="m-0 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger"
        >
          {message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={m.isPending || token.length === 0}
        className="min-h-12 rounded-xl bg-brand text-base font-semibold text-brand-ink hover:bg-brand/90"
      >
        {m.isPending ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
