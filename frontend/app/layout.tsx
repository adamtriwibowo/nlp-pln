import type { Metadata, Viewport } from "next";
import { EB_Garamond, Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import "../styles/tokens.css";
import { SiteHeader } from "@/components/site-header";
import { QueryProvider } from "@/lib/query-provider";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

// Regulation wording is set in a book serif so quoted articles read as legal text, and ids/hashes
// in the admin area use a monospace face with tabular figures.
const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "K2-RAG — Tanya aturan K3 listrik",
  description:
    "Asisten tanya jawab regulasi keselamatan ketenagalistrikan. Setiap jawaban menyertakan pasal dan halaman PDF sumbernya.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#12171e" },
  ],
};

// Applies a saved manual theme before first paint (no flash). Falls back to the OS setting.
const themeScript =
  'try{var t=localStorage.getItem("k2.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${geist.variable} ${garamond.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#konten"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:text-ink focus:shadow-lg"
        >
          Lewati ke konten
        </a>
        <QueryProvider>
          <SiteHeader />
          <div id="konten" className="flex flex-1 flex-col">
            {children}
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
