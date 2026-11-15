"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRequireRole } from "@/lib/use-require-role";

import { ConfigTab } from "./tabs/config-tab";
import { DatasetTab } from "./tabs/dataset-tab";
import { DocumentsTab } from "./tabs/documents-tab";
import { EvalTab } from "./tabs/eval-tab";
import { PlaygroundTab } from "./tabs/playground-tab";

const TABS = [
  ["dokumen", "Dokumen", DocumentsTab],
  ["dataset", "Dataset", DatasetTab],
  ["uji", "Uji pertanyaan", PlaygroundTab],
  ["konfigurasi", "Konfigurasi", ConfigTab],
  ["evaluasi", "Evaluasi", EvalTab],
] as const;

export default function AdminPage() {
  const { ready } = useRequireRole([], "/admin");
  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-8" aria-busy="true">
        <Skeleton className="h-96 w-full" />
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <h1 className="m-0 font-heading text-3xl font-bold tracking-tight">
        Admin
      </h1>
      <Tabs defaultValue="dokumen">
        <div className="max-w-full overflow-x-auto">
          <TabsList className="h-11 p-1">
            {TABS.map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-9 px-4 text-sm"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {TABS.map(([value, , Panel]) => (
          <TabsContent
            key={value}
            value={value}
            className="flex flex-col gap-6 pt-4"
          >
            <Panel />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
