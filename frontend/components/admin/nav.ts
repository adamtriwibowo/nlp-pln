import {
  BarChart3,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only an exact path match marks it active (the overview would otherwise always match). */
  exact?: boolean;
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    title: null,
    items: [
      {
        href: "/admin",
        label: "Ringkasan",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    title: "Data",
    items: [
      { href: "/admin/dokumen", label: "Dokumen", icon: FileText },
      { href: "/admin/dataset", label: "Dataset", icon: ListChecks },
    ],
  },
  {
    title: "Eksperimen",
    items: [
      { href: "/admin/uji", label: "Uji pertanyaan", icon: FlaskConical },
      { href: "/admin/evaluasi", label: "Evaluasi", icon: BarChart3 },
      {
        href: "/admin/konfigurasi",
        label: "Konfigurasi",
        icon: SlidersHorizontal,
      },
    ],
  },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
