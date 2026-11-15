import { PageHeader } from "@/components/admin/page-header";

import { DatasetTab } from "../tabs/dataset-tab";

export const metadata = { title: "Dataset — Admin K2-RAG" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Dataset"
        description="Kelola pertanyaan uji, pilih chunk gold, dan bekukan split test sebelum tuning."
      />
      <div className="flex flex-col gap-6">
        <DatasetTab />
      </div>
    </>
  );
}
