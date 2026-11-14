"use client";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageBox } from "@/lib/api";

// The worker must be configured in the same module that renders <Document>/<Page>.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// Constant (not recreated per render, or react-pdf would reload the document). Assets are copied
// to public/pdfjs by scripts/copy-pdfjs-assets.mjs: the corpus PDFs are JBIG2 scans, which need the
// WASM decoder to draw the page image under the OCR text.
const PDF_OPTIONS = {
  wasmUrl: "/pdfjs/wasm/",
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

interface Props {
  docId: string;
  startPage: number;
  boxes: PageBox[];
  sourceLabel: string;
}

/** PDF page with the cited block highlighted. bbox is in PDF points (origin top-left). */
export default function PdfViewerInner({
  docId,
  startPage,
  boxes,
  sourceLabel,
}: Props) {
  const url = `/api/documents/${docId}/file`;
  const [page, setPage] = useState(startPage);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [orig, setOrig] = useState<{ w: number; h: number } | null>(null);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageBoxes = boxes.filter((b) => b.page === page);
  const scale = orig && width ? width / orig.w : 0;

  useEffect(() => {
    if (scale > 0) hlRef.current?.scrollIntoView({ block: "center" });
  }, [page, scale, startPage]);

  const go = (delta: number) =>
    setPage((p) => Math.min(Math.max(1, p + delta), numPages ?? p + delta));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-ink-muted" aria-live="polite">
          Halaman {page}
          {numPages ? ` dari ${numPages}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            aria-label="Halaman sebelumnya"
            disabled={page <= 1}
            onClick={() => go(-1)}
            className="size-11 min-h-11 rounded-[10px]"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Halaman berikutnya"
            disabled={numPages !== null && page >= numPages}
            onClick={() => go(1)}
            className="size-11 min-h-11 rounded-[10px]"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <a
            href={url}
            download
            aria-label="Unduh PDF"
            className="inline-flex size-11 items-center justify-center rounded-[10px] border border-line bg-surface text-ink hover:bg-surface-2"
          >
            <Download className="size-[18px]" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="overflow-auto rounded-md bg-surface-2 p-3 sm:p-4"
      >
        <div className="relative mx-auto w-fit" data-testid="pdf-page">
          <Document
            file={url}
            options={PDF_OPTIONS}
            onLoadSuccess={(d) => setNumPages(d.numPages)}
            loading={<Skeleton className="h-[480px] w-full" />}
            error={
              <p role="alert" className="p-4 text-sm text-danger">
                PDF tidak dapat dimuat.{" "}
                <a
                  className="text-cite underline"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka di tab baru
                </a>
              </p>
            }
          >
            <Page
              pageNumber={page}
              width={Math.max(width - 24, 200)}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadSuccess={(p) =>
                setOrig({ w: p.originalWidth, h: p.originalHeight })
              }
              loading={<Skeleton className="h-[480px] w-full" />}
            />
          </Document>
          {orig && scale > 0
            ? pageBoxes.map((b, i) => {
                const [x0, y0, x1, y1] = b.bbox;
                const k = Math.max(width - 24, 200) / orig.w;
                return (
                  <div
                    key={i}
                    ref={i === 0 ? hlRef : undefined}
                    data-testid="pdf-highlight"
                    role="img"
                    aria-label={`Blok teks sumber ${sourceLabel} yang disorot`}
                    className="pointer-events-none absolute rounded-md border-2 border-brand bg-highlight"
                    style={{
                      left: x0 * k - 4,
                      top: y0 * k - 4,
                      width: (x1 - x0) * k + 8,
                      height: (y1 - y0) * k + 8,
                    }}
                  >
                    <span className="absolute -top-3.5 right-2 rounded-md bg-cite px-2 py-0.5 text-[11px] font-semibold text-on-cite">
                      {sourceLabel}
                    </span>
                  </div>
                );
              })
            : null}
        </div>
      </div>
      {pageBoxes.length === 0 && boxes.length > 0 ? (
        <p className="m-0 text-[13px] text-ink-muted">
          Sorotan ada di halaman {boxes.map((b) => b.page).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
