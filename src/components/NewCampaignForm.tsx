"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TemplateOpt {
  id: string; name: string; versionId: string | null; version: number | null;
  messageType: string | null; serriCampaign: string | null; variables: string[];
}

export function NewCampaignForm({
  templates,
  connections,
}: {
  templates: TemplateOpt[];
  connections: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateVersionId, setTemplateVersionId] = useState(templates[0]?.versionId ?? "");
  const [serriConnectionId, setSerriConnectionId] = useState(connections[0]?.id ?? "");
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = templates.find((t) => t.versionId === templateVersionId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, templateVersionId, serriConnectionId, allowDuplicates }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Failed to create campaign");
    router.push(`/campaigns/${data.campaign.id}`);
  }

  if (templates.length === 0 || connections.length === 0) {
    return (
      <div className="card text-sm text-gray-600">
        You need at least one <a href="/templates" className="text-brand-700 underline">template</a> and one{" "}
        <a href="/integrations" className="text-brand-700 underline">Serri connection</a> before creating a campaign.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div>
        <label className="label">Campaign name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="September Placement Reminder – Batch 1" />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div>
        <label className="label">Template</label>
        <select className="input" value={templateVersionId} onChange={(e) => setTemplateVersionId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.versionId ?? t.id} value={t.versionId ?? ""}>{t.name} (v{t.version})</option>
          ))}
        </select>
        {selected && (
          <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <p><b>Message type:</b> {selected.messageType}</p>
            <p><b>Serri campaign:</b> {selected.serriCampaign}</p>
            <p><b>Variables:</b> {selected.variables.map((v) => `$${v}`).join(", ") || "none"}</p>
          </div>
        )}
      </div>
      <div>
        <label className="label">Serri connection</label>
        <select className="input" value={serriConnectionId} onChange={(e) => setSerriConnectionId(e.target.value)}>
          {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={allowDuplicates} onChange={(e) => setAllowDuplicates(e.target.checked)} />
        Allow duplicate phone numbers in this campaign
      </label>
      <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create & continue"}</button>
    </form>
  );
}
