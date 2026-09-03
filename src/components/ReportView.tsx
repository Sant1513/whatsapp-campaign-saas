"use client";
import { useEffect, useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { maskPhone } from "@/lib/format";

const FILTERS = ["all", "sent", "delivered", "read", "failed", "pending"] as const;

export function ReportView({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const p = new URLSearchParams({ filter, q });
    fetch(`/api/campaigns/${campaignId}/report?${p}`).then((r) => r.json()).then(setData);
  }, [campaignId, filter, q]);

  const s = data?.summary;
  const cards = s ? [
    ["Uploaded", s.uploaded], ["Eligible", s.eligible], ["Excluded", s.excluded],
    ["Sent", s.sent], ["Delivered", s.delivered], ["Read", s.read], ["Failed", s.failed], ["Pending", s.pending],
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{campaignName} — Report</h1>
        <a href={`/api/campaigns/${campaignId}/report?format=csv&filter=${filter}`} className="btn-secondary">Export CSV</a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-8">
        {cards.map(([label, value]) => (
          <div key={label as string} className="card"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-semibold">{value as number}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`badge ${filter === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"} cursor-pointer capitalize`}>{f}</button>
        ))}
        <input className="input ml-auto max-w-xs" placeholder="Search phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-400">
            <tr><th className="pb-2">Name</th><th className="pb-2">Phone</th><th className="pb-2">Status</th><th className="pb-2">Reason</th><th className="pb-2">Sent</th><th className="pb-2">Attempts</th></tr>
          </thead>
          <tbody>
            {(data?.recipients ?? []).map((r: any, i: number) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-2">{r.name || "—"}</td>
                <td className="py-2 font-mono">{maskPhone(r.phone)}</td>
                <td className="py-2"><StatusBadge status={r.status} /></td>
                <td className="py-2 text-gray-500">{r.reason || "—"}</td>
                <td className="py-2 text-gray-500">{r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}</td>
                <td className="py-2">{r.attempts}</td>
              </tr>
            ))}
            {data && data.recipients?.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400">No messages match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
