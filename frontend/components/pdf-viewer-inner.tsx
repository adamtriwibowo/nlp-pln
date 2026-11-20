"use client";

import { ChevronLeft, ChevronRight, Download, Minus, Plus } from "lucide-react";
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
  /** The citation number shown in the margin next to the highlight. */
  sourceNumber: number;
  /** Fill the height of the parent (desktop panel) instead of a fixed viewport share. */
  fill?: boolean;
}

const ZOOM_MIN = 0.75;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

/** PDF page with the cited block highlighted. bbox is in PDF points (origin top-left). */
export default function PdfViewerInner({
  docId,
  startPage,
  boxes,
  sourceLabel,
  sourceNumber,
  fill = false,
}: Props) {
  const url = `/api/documents/${docId}/file`;
  const [page, setPage] = useState(startPage);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [orig, setOrig] = useState<{ w: number; h: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
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
  // the page is drawn `zoom` times the panel width, and the reader scrolls inside the frame
  const pageWidth = Math.max(width - 24 - 28, 200) * zoom;
  const scale = orig && width ? pageWidth / orig.w : 0;

  // Bring the highlight into view by scrolling the PDF frame only (never the surrounding panel).
  useEffect(() => {
    const wrap = wrapRef.current;
    const hl = hlRef.current;
    if (scale <= 0 || !wrap || !hl) return;
    const w = wrap.getBoundingClientRect();
    const h = hl.getBoundingClientRect();
    wrap.scrollTo({
      top: Math.max(0, h.top - w.top + wrap.scrollTop - wrap.clientHeight / 3),
      left: Math.max(0, h.left - w.left + wrap.scrollLeft - 48),
    });
  }, [page, scale, startPage]);

  const go = (delta: number) =>
    setPage((p) => Math.min(Math.max(1, p + delta), numPages ?? p + delta));

  return (
    <div className={`flex flex-col gap-3 ${fill ? "min-h-0 flex-1" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-ink-muted" aria-live="polite">
          Halaman {page}
          {numPages ? ` dari ${numPages}` : ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Ukuran tampilan PDF"
            className="flex items-center gap-1"
          >
            <Button
              type="button"
              variant="outline"
              aria-label="Perkecil"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
              className="size-11 min-h-11 rounded-lg"
            >
              <Minus aria-hidden="true" />
            </Button>
            <button
              type="button"
              aria-label={`${Math.round(zoom * 100)}%: sesuaikan ke lebar panel`}
              title="Sesuaikan ke lebar panel"
              onClick={() => setZoom(1)}
              data-testid="pdf-zoom"
              className="min-h-11 min-w-14 cursor-pointer rounded-lg px-2 text-sm font-semibold tabular-nums hover:bg-surface-2"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              type="button"
              variant="outline"
              aria-label="Perbesar"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
              className="size-11 min-h-11 rounded-lg"
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            aria-label="Halaman sebelumnya"
            disabled={page <= 1}
            onClick={() => go(-1)}
            className="size-11 min-h-11 rounded-lg"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Halaman berikutnya"
            disabled={numPages !== null && page >= numPages}
            onClick={() => go(1)}
            className="size-11 min-h-11 rounded-lg"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <a
            href={url}
            download
            aria-label="Unduh PDF"
            className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-surface-2"
          >
            <Download className="size-[18px]" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div
        ref={wrapRef}
        tabIndex={0}
        role="region"
        aria-label="Halaman PDF (bisa digulir)"
        className={`overflow-auto overscroll-contain rounded-md bg-surface-2 p-3 ${
          fill ? "min-h-[320px] flex-1" : "h-[60dvh]"
        }`}
      >
        <div className="relative mx-auto w-fit pl-7" data-testid="pdf-page">
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
              width={pageWidth}
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
                const k = pageWidth / orig.w;
                return (
                  <div
                    key={i}
                    ref={i === 0 ? hlRef : undefined}
                    data-testid="pdf-highlight"
                    role="img"
                    aria-label={`Blok teks sumber ${sourceLabel} yang disorot`}
                    className="pointer-events-none absolute rounded-sm border border-brand bg-highlight mix-blend-multiply"
                    style={{
                      left: x0 * k - 4 + 28,
                      top: y0 * k - 3,
                      width: (x1 - x0) * k + 8,
                      height: (y1 - y0) * k + 6,
                    }}
                  >
                    {/* the marker sits in the page margin so it never covers the text */}
                    <span
                      aria-hidden="true"
                      className="absolute -left-7 top-0 flex size-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-surface"
                    >
                      {sourceNumber}
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
