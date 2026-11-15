import { PageHeader } from "@/components/admin/page-header";

import { EvalTab } from "../tabs/eval-tab";

export const metadata = { title: "Evaluasi — Admin K2-RAG" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Evaluasi"
        description="Daftar run evaluasi dan perbandingan metrik antar konfigurasi."
      />
      <div className="flex flex-col gap-6">
        <EvalTab />
      </div>
    </>
  );
}
