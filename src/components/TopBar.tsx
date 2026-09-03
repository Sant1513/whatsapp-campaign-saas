"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { doSignOut } from "@/lib/actions";

interface Props {
  role: string;
  orgName: string;
  organizations: { id: string; name: string }[];
  activeOrgId: string;
}

export function TopBar({ role, orgName, organizations, activeOrgId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function switchOrg(id: string) {
    start(async () => {
      await fetch("/api/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: id }),
      });
      router.refresh();
    });
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-3">
        {organizations.length > 1 ? (
          <select
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={activeOrgId}
            disabled={pending}
            onChange={(e) => switchOrg(e.target.value)}
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium">{orgName}</span>
        )}
        <span className="badge bg-gray-100 text-gray-600">{role}</span>
      </div>
      <form action={doSignOut}>
        <button className="text-sm text-gray-500 hover:text-gray-800">Sign out</button>
      </form>
    </header>
  );
}
