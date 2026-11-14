"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { fetchMe, type Me } from "./api";

/** Client-side route guard (the API enforces roles too). Redirects to /masuk when not allowed. */
export function useRequireRole(
  allowed: ("admin" | "reviewer")[],
  next: string,
): { me: Me | undefined; ready: boolean } {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });
  const role = q.data?.role ?? null;
  const ok = role !== null && (role === "admin" || allowed.includes(role));
  useEffect(() => {
    if (q.isSuccess && !ok)
      router.replace(`/masuk?next=${encodeURIComponent(next)}`);
  }, [q.isSuccess, ok, router, next]);
  return { me: q.data, ready: q.isSuccess && ok };
}
