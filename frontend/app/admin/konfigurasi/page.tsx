import { PageHeader } from "@/components/admin/page-header";

import { ConfigTab } from "../tabs/config-tab";

export const metadata = { title: "Konfigurasi — Admin K2-RAG" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Konfigurasi"
        description="Model, korpus, dan batas yang aktif (baca-saja), serta menjalankan evaluasi pada split dev."
      />
      <div className="flex flex-col gap-6">
        <ConfigTab />
      </div>
    </>
  );
}
