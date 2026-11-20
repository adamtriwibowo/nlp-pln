"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Drawer } from "@/components/admin/drawer";
import { ADMIN_NAV, isActive } from "@/components/admin/nav";
import { SidebarContent } from "@/components/admin/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireRole } from "@/lib/use-require-role";

const KEY = "k2.admin.sidebar";
const listeners = new Set<() => void>();

function readSidebar(): boolean {
  try {
    return localStorage.getItem(KEY) === "collapsed";
  } catch {
    return false;
  }
}
function writeSidebar(collapsed: boolean) {
  try {
    localStorage.setItem(KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  listeners.forEach((l) => l());
}
function subscribeSidebar(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Left-sidebar shell for /admin: collapsible rail on desktop, drawer on phones. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready } = useRequireRole([], pathname);
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    readSidebar,
    () => false,
  );
  // The drawer is tied to the path it was opened on, so navigating closes it without an effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawer = drawerPath === pathname;
  const toggle = () => writeSidebar(!collapsed);

  if (!ready) {
    return (
      <div className="flex flex-1" aria-busy="true">
        <div className="hidden w-64 bg-side lg:block" />
        <div className="flex-1 p-8">
          <Skeleton className="mb-6 h-9 w-56" />
          <Skeleton className="h-80 w-full max-w-5xl" />
        </div>
      </div>
    );
  }

  const current = ADMIN_NAV.flatMap((g) => g.items).find((i) =>
    isActive(i, pathname),
  );

  return (
    <div className="flex min-h-dvh flex-1 bg-ground">
      <aside
        aria-label="Menu admin"
        data-collapsed={collapsed}
        className={`sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 lg:block ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggle} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-3 py-2 lg:hidden">
          <button
            type="button"
            aria-label="Buka menu"
            data-testid="open-drawer"
            onClick={() => setDrawerPath(pathname)}
            className="flex size-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-surface-2"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Link
            href="/admin"
            className="font-heading text-lg font-semibold tracking-tight no-underline"
          >
            K2-RAG
          </Link>
          <span className="truncate text-sm text-ink-muted">
            {current?.label ?? "Admin"}
          </span>
        </div>

        <main
          id="admin-main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-9"
        >
          {children}
        </main>
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawerPath(null)}
        label="Menu admin"
      >
        <SidebarContent
          collapsed={false}
          onNavigate={() => setDrawerPath(null)}
        />
      </Drawer>
    </div>
  );
}
