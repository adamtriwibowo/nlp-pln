import { PageHeader } from "@/components/admin/page-header";

import { PlaygroundTab } from "../tabs/playground-tab";

export const metadata = { title: "Uji pertanyaan — Admin K2-RAG" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Uji pertanyaan"
        description="Jalankan satu pertanyaan pada konfigurasi pilihan dan periksa peringkat chunk, gold, serta sitasi."
      />
      <div className="flex flex-col gap-6">
        <PlaygroundTab />
      </div>
    </>
  );
}
