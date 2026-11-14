"use client";

import { useEffect, useRef } from "react";

/** Mobile bottom sheet on the native <dialog>: focus is trapped, Esc and backdrop close it. */
export function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
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
      aria-label={label}
      data-testid="bottom-sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-line bg-surface p-0 text-ink shadow-2xl"
    >
      <div
        className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line"
        aria-hidden="true"
      />
      {open ? children : null}
    </dialog>
  );
}
