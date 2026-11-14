"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

// pdf.js needs browser APIs, so the viewer is loaded on the client only.
export const PdfViewer = dynamic(() => import("./pdf-viewer-inner"), {
  ssr: false,
  loading: () => <Skeleton className="h-[480px] w-full" />,
});
