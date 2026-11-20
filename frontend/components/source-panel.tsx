"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { PdfViewer } from "@/components/pdf-viewer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchChunk, type Citation } from "@/lib/api";

/** Right-hand (desktop) / bottom-sheet (mobile) panel: cited text, PDF page and highlight. */
export function SourcePanel({
  citation,
  onClose,
  fill = false,
}: {
  citation: Citation | null;
  onClose?: () => void;
  /** Stretch to the height of the parent so the PDF uses all the space (desktop panel). */
  fill?: boolean;
}) {
  const chunk = useQuery({
    queryKey: ["chunk", citation?.chunk_id],
    queryFn: () => fetchChunk(citation!.chunk_id),
    enabled: citation !== null,
    staleTime: 10 * 60_000,
  });

  if (!citation) {
    return (
      <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="m-0 font-semibold">Pilih sumber</p>
        <p className="m-0 max-w-xs text-sm text-ink-muted">
          Klik nomor sumber pada jawaban untuk melihat teks pasal dan halaman
          PDF yang disorot.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="source-panel"
      className={`flex flex-col ${fill ? "h-full min-h-0" : ""}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-cite">
            Sumber {citation.label}
          </span>
          <h2 className="m-0 text-base font-semibold">
            {citation.doc_title ?? citation.doc_id}
          </h2>
          <span className="text-[13px] text-ink-muted">
            {citation.ref}
            {chunk.data ? ` · halaman ${chunk.data.page_start}` : ""}
          </span>
        </div>
        {onClose ? (
          <Button
            type="button"
            variant="outline"
            aria-label="Tutup panel sumber"
            onClick={onClose}
            className="size-11 min-h-11 shrink-0 rounded-lg"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div
        className={`flex flex-col gap-4 p-5 ${fill ? "min-h-0 flex-1" : ""}`}
      >
        {chunk.isPending ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-[420px] w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : chunk.isError ? (
          <p role="alert" className="text-sm text-danger">
            Teks sumber tidak dapat dimuat. Tutup panel lalu coba klik sumbernya
            lagi.
          </p>
        ) : (
          <>
            <PdfViewer
              key={chunk.data.chunk_id}
              docId={chunk.data.doc_id}
              startPage={chunk.data.page_start}
              boxes={chunk.data.bbox ?? []}
              sourceLabel={chunk.data.label}
              sourceNumber={citation.label}
              fill={fill}
            />
            <details
              open
              className="shrink-0 rounded-lg border border-line bg-surface"
            >
              <summary className="min-h-11 cursor-pointer px-4 py-2.5 text-sm font-semibold">
                Teks pasal
              </summary>
              <div
                tabIndex={0}
                role="region"
                aria-label="Teks pasal (bisa digulir)"
                className="flex max-h-56 flex-col gap-2 overflow-y-auto px-4 pb-4"
              >
                <p className="m-0 whitespace-pre-line font-serif text-[19px] leading-[1.7]">
                  {chunk.data.text}
                </p>
                {chunk.data.ocr_noisy ? (
                  <p className="m-0 rounded-lg bg-warn-tint px-3 py-2 text-[13px] text-warn">
                    Teks dokumen ini hasil OCR dan dapat memuat salah baca.
                    Periksa langsung pada PDF.
                  </p>
                ) : null}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
