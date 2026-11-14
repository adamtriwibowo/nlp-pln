import Link from "next/link";

export function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg"
      aria-label="K2-RAG, ke beranda"
    >
      <span
        className="flex size-9 items-center justify-center rounded-[10px] bg-brand"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="var(--k2-brand-ink)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      </span>
      <span className="font-heading text-xl font-bold tracking-tight">
        K2-RAG
      </span>
    </Link>
  );
}
