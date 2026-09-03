"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddConnectionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", endpoint: "https://backend.api-wa.co/campaign/serri-india/api/v2",
    apiKey: "", defaultUserName: "Hire From Us", defaultSource: "new-landing-page form",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await fetch("/api/serri-connections", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) return setError(data.error ?? "Failed");
    setOpen(false); setForm({ ...form, name: "", apiKey: "" }); router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-secondary">+ Add Serri connection</button>;

  return (
    <form onSubmit={submit} className="card max-w-lg space-y-3">
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div><label className="label">Connection name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Admissions WhatsApp" /></div>
      <div><label className="label">Endpoint</label><input className="input" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} required /></div>
      <div><label className="label">API Key</label><input className="input" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required placeholder="Stored encrypted; never shown again" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Default userName</label><input className="input" value={form.defaultUserName} onChange={(e) => setForm({ ...form, defaultUserName: e.target.value })} /></div>
        <div><label className="label">Default source</label><input className="input" value={form.defaultSource} onChange={(e) => setForm({ ...form, defaultSource: e.target.value })} /></div>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save connection"}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
      </div>
      <p className="text-xs text-gray-400">The key is encrypted at rest (AES-256-GCM) and only decrypted server-side at send time. It is never returned to the browser.</p>
    </form>
  );
}
