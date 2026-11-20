"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ADMIN_NAV, isActive, type NavItem } from "@/components/admin/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { fetchMe, logout } from "@/lib/api";
import { fetchConfig, fetchQA } from "@/lib/lab-api";

/** Small live hints next to menu items (shares the cache with the pages, so they cost nothing). */
function useBadges(): Record<
  string,
  { text: string; label: string; tone?: "warn" } | undefined
> {
  const qa = useQuery({
    queryKey: ["qa"],
    queryFn: fetchQA,
    staleTime: 30_000,
    retry: false,
  });
  const cfg = useQuery({
    queryKey: ["admin-config"],
    queryFn: fetchConfig,
    staleTime: 30_000,
    retry: false,
  });
  const out: ReturnType<typeof useBadges> = {};
  if (qa.data) {
    out["/admin/dataset"] = {
      text: `${qa.data.stats.total}/${qa.data.stats.target_min}`,
      label: `${qa.data.stats.total} dari ${qa.data.stats.target_min} pertanyaan`,
    };
  }
  if (cfg.data && cfg.data.warnings.length > 0) {
    out["/admin/konfigurasi"] = {
      text: String(cfg.data.warnings.length),
      label: `${cfg.data.warnings.length} peringatan konfigurasi`,
      tone: "warn",
    };
  }
  return out;
}

function NavLink({
  item,
  active,
  collapsed,
  badge,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badge?: { text: string; label: string; tone?: "warn" };
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium no-underline outline-offset-[-2px] transition-colors ${
        collapsed ? "justify-center px-0" : ""
      } ${
        active
          ? "bg-side-active text-side-ink before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-full before:bg-side-ink"
          : "text-side-muted hover:bg-side-active/60 hover:text-side-ink"
      }`}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className={collapsed ? "sr-only" : "flex-1 truncate"}>
        {item.label}
      </span>
      {badge ? <span className="sr-only">{`, ${badge.label}`}</span> : null}
      {badge && !collapsed ? (
        <span
          aria-hidden="true"
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            badge.tone === "warn"
              ? "bg-warn-tint text-warn"
              : "bg-side-line text-side-ink"
          }`}
        >
          {badge.text}
        </span>
      ) : null}
      {badge && collapsed && badge.tone === "warn" ? (
        <span
          aria-hidden="true"
          className="absolute right-2 top-2 size-2 rounded-full bg-brand"
        />
      ) : null}
    </Link>
  );
}

export function SidebarContent({
  collapsed,
  onToggleCollapse,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });
  const badges = useBadges();
  const name = me.data?.name ?? (me.data?.role === "admin" ? "Admin" : "");

  return (
    <div className="flex h-full min-h-0 flex-col bg-side text-side-ink">
      <div
        className={`flex items-center gap-3 border-b border-side-line px-4 py-4 ${collapsed ? "justify-center px-0" : ""}`}
      >
        <Link
          href="/admin"
          onClick={onNavigate}
          aria-label={collapsed ? "K2-RAG Panel admin" : undefined}
          className="flex items-center gap-3 rounded-lg no-underline"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="var(--k2-brand-ink)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
            </svg>
          </span>
          {collapsed ? null : (
            <span className="flex flex-col leading-tight">
              <span className="font-heading text-lg font-semibold tracking-tight text-side-ink">
                K2-RAG
              </span>
              <span className="text-[13px] text-side-muted">Panel admin</span>
            </span>
          )}
        </Link>
      </div>

      <nav
        aria-label="Navigasi admin"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4"
      >
        {ADMIN_NAV.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            {group.title ? (
              collapsed ? (
                <hr className="mx-2 my-1 border-side-line" />
              ) : (
                <p className="m-0 px-3 pb-1 text-[13px] font-semibold text-side-muted">
                  {group.title}
                </p>
              )
            ) : null}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item, pathname)}
                collapsed={collapsed}
                badge={badges[item.href]}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t border-side-line p-3">
        <div
          className={`flex items-center gap-3 px-1 py-1 ${collapsed ? "justify-center" : ""}`}
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-side-active text-sm font-semibold"
          >
            {(name || "A").slice(0, 1).toUpperCase()}
          </span>
          {collapsed ? null : (
            <span className="flex min-w-0 flex-col leading-tight">
              <span
                className="truncate text-sm font-semibold"
                data-testid="admin-user"
              >
                {name || "Admin"}
              </span>
              <span className="text-[13px] text-side-muted">Administrator</span>
            </span>
          )}
        </div>
        <div
          className={`flex gap-2 ${collapsed ? "flex-col items-center" : "items-center"}`}
        >
          <Link
            href="/"
            title={collapsed ? "Buka aplikasi" : undefined}
            className={`flex min-h-11 flex-1 items-center gap-3 rounded-lg px-3 text-sm font-medium text-side-muted no-underline hover:bg-side-active/60 hover:text-side-ink ${collapsed ? "justify-center px-0" : ""}`}
          >
            <ExternalLink className="size-[18px] shrink-0" aria-hidden="true" />
            <span className={collapsed ? "sr-only" : ""}>Buka aplikasi</span>
          </Link>
          <ThemeToggle onDark />
        </div>
        <button
          type="button"
          title={collapsed ? "Keluar" : undefined}
          onClick={async () => {
            await logout();
            await qc.invalidateQueries({ queryKey: ["me"] });
            router.replace("/masuk");
          }}
          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium text-side-muted hover:bg-side-active/60 hover:text-side-ink ${collapsed ? "justify-center px-0" : ""}`}
        >
          <LogOut className="size-[18px] shrink-0" aria-hidden="true" />
          <span className={collapsed ? "sr-only" : ""}>Keluar</span>
        </button>
        {onToggleCollapse ? (
          <button
            type="button"
            data-testid="collapse-sidebar"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Lebarkan menu" : "Ciutkan menu"}
            title={collapsed ? "Lebarkan menu" : undefined}
            onClick={onToggleCollapse}
            className={`hidden min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium text-side-muted hover:bg-side-active/60 hover:text-side-ink lg:flex ${collapsed ? "justify-center px-0" : ""}`}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-[18px]" aria-hidden="true" />
            )}
            {collapsed ? null : <span>Ciutkan menu</span>}
          </button>
        ) : null}
      </div>
    </div>
  );
}
