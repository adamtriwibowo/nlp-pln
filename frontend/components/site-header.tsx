"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { fetchMe, logout } from "@/lib/api";

const linkClass =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-[15px] font-medium text-cite no-underline hover:underline";

export function SiteHeader() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });
  const role = me.data?.role ?? null;
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-8 lg:px-12">
      <Logo />
      <nav
        aria-label="Navigasi utama"
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <Link href="/#cara-kerja" className={linkClass}>
          Cara kerja
        </Link>
        <Link href="/#dokumen" className={linkClass}>
          Dokumen
        </Link>
        {role === "reviewer" || role === "admin" ? (
          <Link href="/review" className={linkClass}>
            Review
          </Link>
        ) : null}
        {role === "admin" ? (
          <Link href="/admin" className={linkClass}>
            Admin
          </Link>
        ) : null}
        {role ? (
          <button
            type="button"
            className={`${linkClass} cursor-pointer`}
            onClick={async () => {
              await logout();
              await qc.invalidateQueries({ queryKey: ["me"] });
            }}
          >
            Keluar{me.data?.name ? ` (${me.data.name})` : ""}
          </button>
        ) : (
          <Link href="/masuk" className={linkClass}>
            Masuk
          </Link>
        )}
        <ThemeToggle />
      </nav>
    </header>
  );
}
