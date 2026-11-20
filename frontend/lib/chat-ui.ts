"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "k2.sidebarCollapsed";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Whether the desktop sidebar is folded to an icon rail (kept in this browser). */
export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(KEY, read() ? "0" : "1");
    } catch {
      /* storage unavailable: the choice just lasts for this page view */
    }
    listeners.forEach((l) => l());
  }, []);
  return [collapsed, toggle] as const;
}
