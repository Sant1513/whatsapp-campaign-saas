"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/rbac";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/templates", label: "Templates" },
  { href: "/contacts", label: "Contacts" },
  { href: "/history", label: "Message History" },
  { href: "/reports", label: "Reports" },
  { section: "Admin" },
  { href: "/integrations", label: "Integrations" },
  { href: "/users", label: "Users & Teams" },
  { href: "/settings", label: "Settings" },
  { href: "/audit", label: "Audit Logs" },
] as const;

export function Sidebar({ role, isSuperAdmin }: { role: Role; isSuperAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white md:block">
      <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">W</div>
        <span className="text-sm font-semibold">Campaign Console</span>
      </div>
      <nav className="space-y-1 p-3">
        {NAV.map((item, i) =>
          "section" in item ? (
            <p key={i} className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">{item.section}</p>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                pathname.startsWith(item.href) ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          ),
        )}
        {isSuperAdmin && (
          <>
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Platform</p>
            <Link href="/admin/organizations" className={`block rounded-lg px-3 py-2 text-sm ${pathname.startsWith("/admin") ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-50"}`}>Organizations</Link>
            <Link href="/admin/health" className="block rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">System Health</Link>
          </>
        )}
      </nav>
      <p className="px-5 pt-4 text-[11px] text-gray-400">Role: {role}</p>
    </aside>
  );
}
