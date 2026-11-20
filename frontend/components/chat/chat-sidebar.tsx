"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, LogIn, LogOut, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { fetchMe, logout } from "@/lib/api";
import type { Chat } from "@/lib/chats";

const DAY = 86_400_000;

function groupChats(chats: Chat[], now = Date.now()) {
  const start = new Date(now).setHours(0, 0, 0, 0);
  const groups: [string, Chat[]][] = [
    ["Hari ini", []],
    ["7 hari terakhir", []],
    ["Lebih lama", []],
  ];
  for (const c of chats) {
    if (c.updatedAt >= start) groups[0][1].push(c);
    else if (c.updatedAt >= start - 6 * DAY) groups[1][1].push(c);
    else groups[2][1].push(c);
  }
  return groups.filter(([, items]) => items.length > 0);
}

const rowLink =
  "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-[15px] font-medium text-ink-muted no-underline transition-colors hover:bg-surface-2 hover:text-ink";

/** Left column of the chat app: new chat, history grouped by day, links and account. */
export function ChatSidebar({
  chats,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: {
  chats: Chat[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });
  const role = me.data?.role ?? null;
  const groups = groupChats(chats);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1 pt-1">
        <Logo />
      </div>
      <button
        type="button"
        onClick={onNew}
        data-testid="new-chat"
        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-[15px] font-semibold text-ink transition-colors hover:border-cite hover:bg-cite-tint"
      >
        <Plus aria-hidden="true" className="size-[18px]" />
        Percakapan baru
      </button>

      <nav
        aria-label="Riwayat percakapan"
        data-testid="chat-history"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-1"
      >
        {groups.length === 0 ? (
          <p className="m-0 px-3 text-[13px] leading-relaxed text-ink-muted">
            Percakapan Anda akan muncul di sini dan tersimpan di browser ini
            saja.
          </p>
        ) : (
          groups.map(([label, items]) => (
            <section key={label} className="flex flex-col gap-0.5">
              <h2 className="m-0 px-3 pb-1 text-[13px] font-semibold text-ink-muted">
                {label}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {items.map((c) => (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      data-testid="chat-item"
                      aria-current={c.id === activeId ? "page" : undefined}
                      onClick={() => onSelect(c.id)}
                      className={`min-h-11 w-full cursor-pointer truncate rounded-lg py-2 pl-3 pr-11 text-left text-[15px] transition-colors ${
                        c.id === activeId
                          ? "bg-cite-tint font-semibold text-ink"
                          : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      aria-label={`Hapus percakapan: ${c.title}`}
                      onClick={() => onDelete(c.id)}
                      className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-ink-muted opacity-100 transition-opacity hover:bg-surface hover:text-danger focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-line pt-3">
        <Link href="/tentang" className={rowLink}>
          <BookOpen aria-hidden="true" className="size-[18px]" />
          Cara kerja dan dokumen
        </Link>
        {role === "reviewer" || role === "admin" ? (
          <Link href="/review" className={rowLink}>
            Review
          </Link>
        ) : null}
        {role === "admin" ? (
          <Link href="/admin" className={rowLink}>
            Admin
          </Link>
        ) : null}
        <div className="flex items-center gap-2">
          {role ? (
            <button
              type="button"
              className={`${rowLink} cursor-pointer`}
              onClick={async () => {
                await logout();
                await qc.invalidateQueries({ queryKey: ["me"] });
              }}
            >
              <LogOut aria-hidden="true" className="size-[18px]" />
              Keluar{me.data?.name ? ` (${me.data.name})` : ""}
            </button>
          ) : (
            <Link href="/masuk" className={rowLink}>
              <LogIn aria-hidden="true" className="size-[18px]" />
              Masuk
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

/** Off-canvas version of the sidebar on small screens (native <dialog>: focus trap, Esc closes). */
export function ChatDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Menu percakapan"
      data-testid="chat-drawer"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="sheet m-0 mr-auto h-dvh max-h-none w-[min(20rem,88vw)] max-w-none overflow-hidden border-0 bg-ground p-0 text-ink"
    >
      {open ? children : null}
    </dialog>
  );
}
