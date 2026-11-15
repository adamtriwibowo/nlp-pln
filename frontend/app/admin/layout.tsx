import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = { title: "Admin — K2-RAG" };

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
