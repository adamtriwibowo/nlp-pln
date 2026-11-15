"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

const KEY = "k2.sourcePanelWidth";
export const PANEL_DEFAULT = 560;
export const PANEL_MIN = 380;
const STEP = 32;

const listeners = new Set<() => void>();

function readStored(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= PANEL_MIN ? v : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The reader's preferred width of the source panel (kept in this browser). */
export function usePanelWidth() {
  const stored = useSyncExternalStore(
    subscribe,
    readStored,
    () => PANEL_DEFAULT,
  );
  const set = useCallback((px: number) => {
    try {
      localStorage.setItem(KEY, String(Math.round(px)));
    } catch {
      /* storage unavailable: the width just lasts for this page view */
    }
    listeners.forEach((l) => l());
  }, []);
  return [stored, set] as const;
}

/** Widest the panel may get while the conversation keeps at least `keepMain` px. */
export function panelMax(viewport: number, sidebar = 290, keepMain = 360) {
  return Math.max(PANEL_MIN, viewport - sidebar - keepMain);
}

/** Draggable (and keyboard-operable) divider on the left edge of the source panel. */
export function PanelSplitter({
  width,
  max,
  onChange,
}: {
  width: number;
  max: number;
  onChange: (px: number) => void;
}) {
  const dragging = useRef(false);
  const clamp = (px: number) => Math.min(Math.max(px, PANEL_MIN), max);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ubah lebar panel sumber"
      aria-valuenow={Math.round(Math.min(width, max))}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={max}
      tabIndex={0}
      data-testid="panel-splitter"
      title="Seret untuk mengubah lebar. Klik dua kali untuk mengembalikan."
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        // the panel sits against the right edge, so its width is the distance to that edge
        if (dragging.current) onChange(clamp(window.innerWidth - e.clientX));
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.style.userSelect = "";
      }}
      onDoubleClick={() => onChange(clamp(PANEL_DEFAULT))}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(clamp(width + STEP));
        else if (e.key === "ArrowRight") onChange(clamp(width - STEP));
        else if (e.key === "Home") onChange(PANEL_MIN);
        else if (e.key === "End") onChange(max);
        else return;
        e.preventDefault();
      }}
      className="group relative z-10 -mx-1.5 hidden w-3 shrink-0 cursor-col-resize touch-none items-stretch justify-center outline-none xl:flex"
    >
      <span className="w-px bg-line transition-colors group-hover:w-0.5 group-hover:bg-brand group-focus-visible:w-0.5 group-focus-visible:bg-brand group-active:w-0.5 group-active:bg-brand" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-full bg-field opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </div>
  );
}
