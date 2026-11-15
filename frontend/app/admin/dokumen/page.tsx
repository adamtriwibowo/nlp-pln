import { PageHeader } from "@/components/admin/page-header";

import { DocumentsTab } from "../tabs/documents-tab";

export const metadata = { title: "Dokumen — Admin K2-RAG" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Dokumen"
        description="Status ingesti setiap PDF di korpus, unggah dokumen baru, dan bangun ulang indeks."
      />
      <div className="flex flex-col gap-6">
        <DocumentsTab />
      </div>
    </>
  );
}
