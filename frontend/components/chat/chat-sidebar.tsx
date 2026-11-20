"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  LogIn,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { fetchMe, logout } from "@/lib/api";
import type { Chat } from "@/lib/chats";

const DAY = 86_400_000;

function groupChats(chats: Chat[], now = Date.now()) {
  const start = new Date(now).setHours(0, 0, 0, 0);
  const groups: [string, Chat[]][] = [
    ["Disematkan", []],
    ["Hari ini", []],
    ["7 hari terakhir", []],
    ["Lebih lama", []],
  ];
  for (const c of chats) {
    if (c.pinned) groups[0][1].push(c);
    else if (c.updatedAt >= start) groups[1][1].push(c);
    else if (c.updatedAt >= start - 6 * DAY) groups[2][1].push(c);
    else groups[3][1].push(c);
  }
  return groups.filter(([, items]) => items.length > 0);
}

const rowLink =
  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-ink-muted no-underline transition-colors hover:bg-surface-2 hover:text-ink";
const railBtn =
  "flex size-10 cursor-pointer items-center justify-center rounded-lg text-ink-muted no-underline transition-colors hover:bg-surface-2 hover:text-ink";

interface Props {
  chats: Chat[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  /** Desktop only: fold the sidebar to an icon rail. Omitted in the mobile drawer. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/** Left column of the chat app: new chat, search, history, links and account. */
export function ChatSidebar({
  chats,
  activeId,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });
  const role = me.data?.role ?? null;
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? chats.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.turns.some((t) => t.question.toLowerCase().includes(q)),
      )
    : chats;
  const groups = groupChats(shown);

  if (collapsed) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center gap-2 p-3">
        <Link
          href="/"
          aria-label="K2-RAG, ke beranda"
          className="flex size-10 items-center justify-center rounded-lg bg-brand text-brand-ink"
        >
          <Zap aria-hidden="true" className="size-5" />
        </Link>
        <button
          type="button"
          onClick={onNew}
          aria-label="Percakapan baru"
          data-testid="new-chat"
          className={`${railBtn} border border-line`}
        >
          <Plus aria-hidden="true" className="size-[18px]" />
        </button>
        <div className="flex-1" />
        <Link
          href="/tentang"
          aria-label="Cara kerja dan dokumen"
          className={railBtn}
        >
          <BookOpen aria-hidden="true" className="size-[18px]" />
        </Link>
        {role ? null : (
          <Link href="/masuk" aria-label="Masuk" className={railBtn}>
            <LogIn aria-hidden="true" className="size-[18px]" />
          </Link>
        )}
        <ThemeToggle />
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Perluas sidebar"
          data-testid="expand-sidebar"
          className={railBtn}
        >
          <PanelLeftOpen aria-hidden="true" className="size-[18px]" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <Logo />
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Ciutkan sidebar"
            data-testid="collapse-sidebar"
            className={`${railBtn} size-9`}
          >
            <PanelLeftClose aria-hidden="true" className="size-[18px]" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onNew}
        data-testid="new-chat"
        className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-cite hover:bg-cite-tint"
      >
        <Plus aria-hidden="true" className="size-[18px]" />
        Percakapan baru
      </button>

      {chats.length > 0 ? (
        <div className="relative">
          <label htmlFor="cari-riwayat" className="sr-only">
            Cari riwayat percakapan
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
          />
          <input
            id="cari-riwayat"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari riwayat"
            autoComplete="off"
            className="min-h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-field focus-visible:ring-[3px] focus-visible:ring-cite-tint"
          />
        </div>
      ) : null}

      <nav
        aria-label="Riwayat percakapan"
        data-testid="chat-history"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-1"
      >
        {chats.length === 0 ? (
          <p className="m-0 px-3 text-[13px] leading-relaxed text-ink-muted">
            Percakapan Anda akan muncul di sini dan tersimpan di browser ini
            saja.
          </p>
        ) : groups.length === 0 ? (
          <p
            role="status"
            className="m-0 px-3 text-[13px] leading-relaxed text-ink-muted"
          >
            Tidak ada percakapan yang cocok dengan “{query.trim()}”.
          </p>
        ) : (
          groups.map(([label, items]) => (
            <section key={label} className="flex flex-col gap-0.5">
              <h2 className="m-0 px-3 pb-1 text-xs font-semibold text-ink-muted">
                {label}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {items.map((c) => (
                  <ChatItem
                    key={c.id}
                    chat={c}
                    active={c.id === activeId}
                    onSelect={() => onSelect(c.id)}
                    onDelete={() => onDelete(c.id)}
                    onRename={(t) => onRename(c.id, t)}
                    onTogglePin={() => onTogglePin(c.id)}
                  />
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

type Mode = "idle" | "menu" | "confirm" | "rename";

function ChatItem({
  chat,
  active,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
}: {
  chat: Chat;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onTogglePin: () => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [title, setTitle] = useState(chat.title);
  const rowRef = useRef<HTMLLIElement>(null);
  const last = chat.turns[chat.turns.length - 1];
  const weak = last && last.meta.badge !== "supported";

  // close the menu on outside click or Escape
  useEffect(() => {
    if (mode !== "menu") return;
    const onDown = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setMode("idle");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("idle");
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [mode]);

  if (mode === "rename") {
    const save = () => {
      onRename(title);
      setMode("idle");
    };
    return (
      <li className="px-1 py-1">
        <label className="sr-only" htmlFor={`rename-${chat.id}`}>
          Nama percakapan
        </label>
        <input
          id={`rename-${chat.id}`}
          autoFocus
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setTitle(chat.title);
              setMode("idle");
            }
          }}
          className="min-h-10 w-full rounded-lg border border-field bg-surface px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-cite-tint"
        />
      </li>
    );
  }

  if (mode === "confirm") {
    return (
      <li
        role="group"
        aria-label={`Konfirmasi hapus: ${chat.title}`}
        className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-3"
      >
        <p className="m-0 text-[13px] leading-snug">
          Hapus percakapan ini dari browser Anda? Ini tidak bisa dibatalkan.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            data-testid="confirm-delete-chat"
            className="min-h-9 cursor-pointer rounded-lg bg-danger px-3 text-[13px] font-semibold text-surface"
          >
            Ya, hapus
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="min-h-9 cursor-pointer rounded-lg border border-line bg-surface px-3 text-[13px] font-medium"
          >
            Batal
          </button>
        </div>
      </li>
    );
  }

  const item =
    "flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg py-2 pl-3 pr-10 text-left text-sm";
  return (
    <li ref={rowRef} className="group relative">
      <button
        type="button"
        data-testid="chat-item"
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
        className={`${item} transition-colors ${
          active
            ? "bg-cite-tint font-medium text-ink"
            : "text-ink hover:bg-surface-2"
        }`}
      >
        {chat.pinned ? (
          <Pin
            aria-label="Disematkan"
            className="size-3.5 shrink-0 text-ink-muted"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
        {weak ? (
          <span
            title="Jawaban terakhir: bukti terbatas atau tidak ditemukan"
            className="size-2 shrink-0 rounded-full bg-warn"
          >
            <span className="sr-only">
              Jawaban terakhir: bukti terbatas atau tidak ditemukan
            </span>
          </span>
        ) : null}
      </button>
      <button
        type="button"
        aria-label={`Opsi percakapan: ${chat.title}`}
        aria-haspopup="menu"
        aria-expanded={mode === "menu"}
        data-testid="chat-options"
        onClick={() => setMode(mode === "menu" ? "idle" : "menu")}
        className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-muted opacity-100 transition-opacity hover:bg-surface hover:text-ink focus-visible:opacity-100 aria-expanded:opacity-100 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>
      {mode === "menu" ? (
        <div
          role="menu"
          aria-label={`Opsi: ${chat.title}`}
          className="absolute right-1 top-full z-20 mt-1 flex w-48 flex-col rounded-lg border border-line bg-surface p-1 shadow-md"
        >
          <MenuItem
            icon={Pencil}
            onClick={() => {
              setTitle(chat.title);
              setMode("rename");
            }}
          >
            Ganti nama
          </MenuItem>
          <MenuItem
            icon={chat.pinned ? PinOff : Pin}
            onClick={() => {
              onTogglePin();
              setMode("idle");
            }}
          >
            {chat.pinned ? "Lepas sematan" : "Sematkan"}
          </MenuItem>
          <MenuItem icon={Trash2} danger onClick={() => setMode("confirm")}>
            Hapus
          </MenuItem>
        </div>
      ) : null}
    </li>
  );
}

function MenuItem({
  icon: Icon,
  danger = false,
  onClick,
  children,
}: {
  icon: typeof Pencil;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-surface-2 ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </button>
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
