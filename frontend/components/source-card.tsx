"use client";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Citation } from "@/lib/api";

export function SourceCard({
  citation,
  active,
  onOpen,
}: {
  citation: Citation;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <article
      data-testid={`source-${citation.label}`}
      className={`flex flex-wrap items-start gap-3.5 rounded-[14px] bg-surface p-4 ${
        active ? "border-2 border-cite" : "border border-line"
      }`}
    >
      <span
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold ${
          active ? "bg-cite text-on-cite" : "bg-cite-tint text-cite"
        }`}
        aria-hidden="true"
      >
        {citation.label}
      </span>
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
        <h3 className="m-0 text-base font-semibold">
          {citation.doc_title ?? citation.doc_id}
        </h3>
        <p className="m-0 text-[13px] text-ink-muted">
          {citation.ref}
          {citation.page_start ? ` · hlm. ${citation.page_start}` : ""}
        </p>
        <blockquote className="m-0 whitespace-pre-line text-sm leading-relaxed text-ink">
          “{citation.quote}”
        </blockquote>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onOpen}
        className="min-h-11 rounded-[10px] border-cite px-4 text-sm font-semibold text-cite"
      >
        Buka di PDF
        <ExternalLink aria-hidden="true" />
      </Button>
    </article>
  );
}
