"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  return set === "light" || set === "dark" ? set : systemTheme();
}

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
};

export function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const theme = useSyncExternalStore(
    subscribe,
    current,
    () => "light" as Theme,
  );
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <Button
      type="button"
      variant="outline"
      className={
        onDark
          ? "size-11 min-h-11 shrink-0 rounded-xl border-side-line bg-transparent text-side-muted hover:bg-side-active/60 hover:text-side-ink"
          : "size-11 min-h-11 rounded-xl"
      }
      aria-label={next === "dark" ? "Pakai tema gelap" : "Pakai tema terang"}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("k2.theme", next);
        } catch {
          /* storage unavailable: the choice just lasts for this page view */
        }
        listeners.forEach((l) => l());
      }}
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" />
      ) : (
        <Moon aria-hidden="true" />
      )}
    </Button>
  );
}
