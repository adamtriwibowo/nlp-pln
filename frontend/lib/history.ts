"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { FinishedAnswer } from "./use-ask";

const KEY = "k2.history";
const MAX = 20;
const empty: FinishedAnswer[] = [];
let cache: { raw: string | null; value: FinishedAnswer[] } = {
  raw: null,
  value: empty,
};
const listeners = new Set<() => void>();

function read(): FinishedAnswer[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === cache.raw) return cache.value;
    const value = raw ? (JSON.parse(raw) as FinishedAnswer[]) : empty;
    cache = { raw, value };
    return value;
  } catch {
    return empty;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Per-session conversation history (sessionStorage; cleared when the tab closes). */
export function useHistory() {
  const items = useSyncExternalStore(subscribe, read, () => empty);
  const add = useCallback((a: FinishedAnswer) => {
    try {
      const next = [
        a,
        ...read().filter((x) => x.question !== a.question || x.mode !== a.mode),
      ].slice(0, MAX);
      sessionStorage.setItem(KEY, JSON.stringify(next));
      listeners.forEach((l) => l());
    } catch {
      /* storage unavailable (private mode): history is simply not kept */
    }
  }, []);
  return { items, add };
}
