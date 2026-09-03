"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./StatusBadge";

interface Variable { name: string; required: boolean; fallbackValue: string | null; fallbackAllowed: boolean }
interface Campaign {
  id: string; name: string; status: string; allowDuplicates: boolean;
  fieldMapping: Record<string, string>;
  preflight: { ok: boolean; checks: { key: string; label: string; ok: boolean; detail?: string }[]; eligible: number; excluded: number } | null;
  testStatus: string | null;
  template: { name: string; version: number; messageType: string; serriCampaign: string; variables: Variable[] } | null;
  connection: { name: string; last4: string } | null;
}

const REASON_LABELS: Record<string, string> = {
  INVALID_PHONE: "Invalid phone", DUPLICATE: "Duplicate", MISSING_PARAMETER: "Missing parameter",
  INVALID_URL: "Invalid URL", MISSING_MEDIA: "Missing media", BLANK_ROW: "Blank rows", INVALID_PAYLOAD: "Invalid payload",
};

export function CampaignBuilder({ campaign, headers: initialHeaders }: { campaign: Campaign; headers: string[] }) {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>(initialHeaders);
  const [mapping, setMapping] = useState<Record<string, string>>(campaign.fieldMapping);
  const [uploading, setUploading] = useState(false);
  const [validation, setValidation] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showPayload, setShowPayload] = useState(false);
  const [payload, setPayload] = useState<any>(null);
  const [testPhones, setTestPhones] = useState("");
  const [testVars, setTestVars] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [preflight, setPreflight] = useState(campaign.preflight);
  const [progress, setProgress] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const vars = campaign.template?.variables ?? [];

  const loadValidation = useCallback(async () => {
    const r = await fetch(`/api/campaigns/${campaign.id}/validation`);
    if (r.ok) setValidation(await r.json());
  }, [campaign.id]);

  const loadPreview = useCallback(async (i: number) => {
    const r = await fetch(`/api/campaigns/${campaign.id}/preview?i=${i}`);
    if (r.ok) setPreview(await r.json());
  }, [campaign.id]);

  useEffect(() => { loadValidation(); loadPreview(0); }, [loadValidation, loadPreview]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg("Choose a CSV or Excel file first.");
    setUploading(true); setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/campaigns/${campaign.id}/import`, { method: "POST", body: fd });
    const data = await r.json();
    setUploading(false);
    if (!r.ok) return setMsg(data.error ?? "Upload failed");
    setHeaders(data.headers ?? []);
    setValidation({ uploaded: data.summary.uploaded, eligible: data.summary.eligible, excluded: data.summary.excluded, reasons: data.summary.reasons });
    await loadPreview(0);
    router.refresh();
  }

  async function saveMapping() {
    const r = await fetch(`/api/campaigns/${campaign.id}/mapping`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapping }),
    });
    setMsg(r.ok ? "Mapping saved. Re-upload the file to re-validate with the new mapping." : "Failed to save mapping");
  }

  async function togglePayload() {
    if (!showPayload) {
      const r = await fetch(`/api/campaigns/${campaign.id}/payload-preview?i=${previewIndex}`);
      if (r.ok) setPayload(await r.json());
    }
    setShowPayload(!showPayload);
  }

  async function move(delta: number) {
    const next = Math.max(0, previewIndex + delta);
    setPreviewIndex(next);
    await loadPreview(next);
    if (showPayload) {
      const r = await fetch(`/api/campaigns/${campaign.id}/payload-preview?i=${next}`);
      if (r.ok) setPayload(await r.json());
    }
  }

  async function sendTest() {
    const phones = testPhones.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
    if (!phones.length) return setMsg("Enter at least one test phone.");
    const r = await fetch(`/api/campaigns/${campaign.id}/test`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phones, variables: testVars }),
    });
    const data = await r.json();
    setTestResult(data);
    router.refresh();
  }

  async function runPreflight() {
    const r = await fetch(`/api/campaigns/${campaign.id}/preflight`, { method: "POST" });
    const data = await r.json();
    setPreflight(data);
    router.refresh();
  }

  async function launch() {
    setMsg(null);
    const r = await fetch(`/api/campaigns/${campaign.id}/launch`, { method: "POST" });
    const data = await r.json();
    if (!r.ok) return setMsg(data.error ?? "Launch failed");
    setMsg(`Launched: ${data.messagesCreated} messages queued.`);
    watchProgress();
    router.refresh();
  }

  function watchProgress() {
    const es = new EventSource(`/api/campaigns/${campaign.id}/progress`);
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      setProgress(d);
      if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(d.status)) { es.close(); router.refresh(); }
    };
    es.onerror = () => es.close();
  }

  useEffect(() => {
    if (["SENDING", "PREPARING"].includes(campaign.status)) watchProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canLaunch = preflight?.ok && ["READY", "DRAFT", "SCHEDULED"].includes(campaign.status);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <StatusBadge status={campaign.status} />
            {campaign.template && <span>{campaign.template.name} v{campaign.template.version} · {campaign.template.messageType}</span>}
            {campaign.connection && <span>· {campaign.connection.name} (••••{campaign.connection.last4})</span>}
          </div>
        </div>
        <a href={`/campaigns/${campaign.id}/report`} className="btn-secondary">View Report</a>
      </div>

      {msg && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{msg}</p>}

      {/* Live progress */}
      {progress && (
        <div className="card">
          <div className="mb-2 flex justify-between text-sm"><span className="font-medium">Sending…</span><span>{progress.pct}%</span></div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-500">{progress.processed} / {progress.total} processed · Sent {progress.sent} · Failed {progress.failed} · Pending {progress.pending}</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Audience */}
        <section className="card space-y-3">
          <h2 className="font-semibold">1. Audience</h2>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="block w-full text-sm" />
          <button onClick={upload} className="btn-primary" disabled={uploading}>{uploading ? "Processing…" : "Upload & validate"}</button>
          <p className="text-xs text-gray-400">CSV or Excel. Uploading never sends — it validates first (spec §17, §70-R9).</p>

          {validation && (
            <div className="rounded-lg border border-gray-200 p-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xs text-gray-500">Uploaded</p><p className="text-lg font-semibold">{validation.uploaded}</p></div>
                <div><p className="text-xs text-gray-500">Eligible</p><p className="text-lg font-semibold text-brand-700">{validation.eligible}</p></div>
                <div><p className="text-xs text-gray-500">Excluded</p><p className="text-lg font-semibold text-red-600">{validation.excluded}</p></div>
              </div>
              {validation.reasons && Object.keys(validation.reasons).length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600">
                  {Object.entries(validation.reasons).map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span>{REASON_LABELS[k] ?? k}</span><span>{v as number}</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Mapping */}
        <section className="card space-y-3">
          <h2 className="font-semibold">2. Map fields</h2>
          {headers.length === 0 ? (
            <p className="text-sm text-gray-400">Upload a file to map its columns to template variables.</p>
          ) : (
            <div className="space-y-2">
              {["Phone", ...vars.map((v) => v.name)].map((name) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <span className="w-32 font-mono text-gray-600">${name}</span>
                  <span className="text-gray-400">→</span>
                  <select
                    className="input flex-1"
                    value={mapping[name] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [name]: e.target.value })}
                  >
                    <option value="">— none —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              <button onClick={saveMapping} className="btn-secondary">Save mapping</button>
            </div>
          )}
        </section>

        {/* Preview */}
        <section className="card space-y-3">
          <h2 className="font-semibold">3. Preview</h2>
          {preview?.recipient ? (
            <>
              <div className="mx-auto max-w-xs rounded-2xl bg-[#e5ddd5] p-3">
                <div className="rounded-lg bg-white p-3 text-sm shadow">
                  {preview.preview.media?.url && (
                    <div className="mb-2 rounded bg-gray-100 p-6 text-center text-xs text-gray-400">[ {preview.preview.messageType} media ]</div>
                  )}
                  <p className="whitespace-pre-wrap">{preview.preview.text || <span className="text-gray-400">(no body text)</span>}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <button onClick={() => move(-1)} disabled={previewIndex === 0} className="btn-secondary">← Prev</button>
                <span className="text-gray-500">{preview.recipient.name || preview.recipient.destination} · {previewIndex + 1}/{preview.total}</span>
                <button onClick={() => move(1)} disabled={previewIndex + 1 >= preview.total} className="btn-secondary">Next →</button>
              </div>
              <button onClick={togglePayload} className="text-xs text-gray-500 underline">{showPayload ? "Hide" : "Show"} generated Serri payload (advanced)</button>
              {showPayload && payload && (
                <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-300">{JSON.stringify(payload, null, 2)}</pre>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No eligible recipients to preview yet.</p>
          )}
        </section>

        {/* Test */}
        <section className="card space-y-3">
          <h2 className="font-semibold">4. Test send</h2>
          <p className="text-xs text-gray-400">Uses the real Serri adapter (dry-run unless live mode). Sends are labeled as tests.</p>
          <input className="input" placeholder="Test phones, comma separated" value={testPhones} onChange={(e) => setTestPhones(e.target.value)} />
          {vars.map((v) => (
            <input key={v.name} className="input" placeholder={`$${v.name}${v.fallbackAllowed && v.fallbackValue ? ` (fallback: ${v.fallbackValue})` : ""}`}
              value={testVars[v.name] ?? ""} onChange={(e) => setTestVars({ ...testVars, [v.name]: e.target.value })} />
          ))}
          <button onClick={sendTest} className="btn-secondary">Send test</button>
          {testResult && (
            <div className="rounded-lg border border-gray-200 p-2 text-xs">
              {testResult.results?.map((r: any, i: number) => (
                <p key={i} className="flex justify-between"><span>{r.phone}</span><span className={r.outcome === "SENT" ? "text-brand-700" : "text-red-600"}>{r.outcome}{r.dryRun ? " (dry-run)" : ""}</span></p>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Preflight + launch */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">5. Preflight & launch</h2>
          <button onClick={runPreflight} className="btn-secondary">Run preflight</button>
        </div>
        {preflight ? (
          <>
            <ul className="space-y-1 text-sm">
              {preflight.checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  <span className={c.ok ? "text-brand-600" : "text-red-600"}>{c.ok ? "✓" : "✕"}</span>
                  <span>{c.label}</span>
                  {c.detail && <span className="text-xs text-gray-400">— {c.detail}</span>}
                </li>
              ))}
            </ul>
            <div className={`rounded-lg p-3 text-sm font-medium ${preflight.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700"}`}>
              {preflight.ok ? "CAMPAIGN READY" : "CAMPAIGN NOT READY — resolve the failing checks above."}
            </div>
            <div className="flex gap-2">
              <button onClick={launch} disabled={!canLaunch} className="btn-primary">Send Now</button>
              <ScheduleButton campaignId={campaign.id} disabled={!canLaunch} onDone={() => router.refresh()} />
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">Run preflight to check readiness before sending (spec §52, §70-R10).</p>
        )}
      </section>
    </div>
  );
}

function ScheduleButton({ campaignId, disabled, onDone }: { campaignId: string; disabled: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  async function schedule() {
    const r = await fetch(`/api/campaigns/${campaignId}/schedule`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runAt: new Date(when).toISOString() }),
    });
    if (r.ok) { setOpen(false); onDone(); } else alert((await r.json()).error);
  }
  return (
    <div className="flex items-center gap-2">
      {open ? (
        <>
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          <button onClick={schedule} className="btn-secondary">Confirm</button>
        </>
      ) : (
        <button onClick={() => setOpen(true)} disabled={disabled} className="btn-secondary">Schedule</button>
      )}
    </div>
  );
}
