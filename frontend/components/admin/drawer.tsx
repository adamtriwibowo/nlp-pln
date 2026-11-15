"use client";

import { useEffect, useRef } from "react";

/** Off-canvas navigation drawer on the native <dialog>: focus trap, Esc and backdrop close it. */
export function Drawer({
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
      data-testid="admin-drawer"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="sheet m-0 mr-auto h-dvh max-h-none w-[min(20rem,88vw)] max-w-none overflow-hidden border-0 bg-side p-0 text-side-ink"
    >
      {open ? children : null}
    </dialog>
  );
}
