"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { FinishedAnswer } from "./use-ask";

/** One conversation = an ordered list of finished answers. Each answer is independent: the API
 *  does not remember earlier turns, so a conversation is only a way to group and revisit them. */
export interface Chat {
  id: string;
  title: string;
  updatedAt: number;
  turns: FinishedAnswer[];
}

const KEY = "k2.chats.v1";
const MAX_CHATS = 40;
const MAX_TURNS = 30;
const empty: Chat[] = [];
let cache: { raw: string | null; value: Chat[] } = { raw: null, value: empty };
const listeners = new Set<() => void>();

function read(): Chat[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cache.raw) return cache.value;
    const value = raw ? (JSON.parse(raw) as Chat[]) : empty;
    cache = { raw, value };
    return value;
  } catch {
    return empty;
  }
}

function write(next: Chat[]) {
  try {
    const sorted = [...next]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CHATS);
    localStorage.setItem(KEY, JSON.stringify(sorted));
    listeners.forEach((l) => l());
  } catch {
    /* storage unavailable or full: history is simply not kept */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb(); // another tab changed the history
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export const newChatId = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

const titleOf = (q: string) => {
  const t = q.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};

export function useChats() {
  const items = useSyncExternalStore(subscribe, read, () => empty);

  const create = useCallback((id: string, firstQuestion: string) => {
    write([
      { id, title: titleOf(firstQuestion), updatedAt: Date.now(), turns: [] },
      ...read().filter((c) => c.id !== id),
    ]);
  }, []);

  const append = useCallback((id: string, turn: FinishedAnswer) => {
    const all = read();
    const found = all.find((c) => c.id === id);
    const base: Chat = found ?? {
      id,
      title: titleOf(turn.question),
      updatedAt: Date.now(),
      turns: [],
    };
    const next: Chat = {
      ...base,
      updatedAt: Date.now(),
      turns: [...base.turns, turn].slice(-MAX_TURNS),
    };
    write([next, ...all.filter((c) => c.id !== id)]);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((c) => c.id !== id));
  }, []);

  return { items, create, append, remove };
}
