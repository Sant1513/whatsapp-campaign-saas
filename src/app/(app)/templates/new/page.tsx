"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ─── cURL parser ──────────────────────────────────────────────────────────────
interface ParsedCurl {
  endpoint: string;
  apiKey: string;
  campaignName: string;
  userName: string;
  source: string;
  paramCount: number;
  paramExamples: string[];
  hasMedia: boolean;
  mediaSpec: Record<string, unknown> | null;
  error?: string;
}

function parseCurl(raw: string): ParsedCurl {
  const empty: ParsedCurl = {
    endpoint: "", apiKey: "", campaignName: "", userName: "",
    source: "", paramCount: 0, paramExamples: [], hasMedia: false, mediaSpec: null,
  };

  // Extract URL — Serri puts it either right after "curl [flags]" OR at the very end.
  // Collect every https:// URL in the string and pick the one containing "api-wa.co" or the last one.
  const allUrls = [...raw.matchAll(/https?:\/\/[^\s'"\\]+/g)].map(m => m[0].replace(/['"]/g, ""));
  const endpoint =
    allUrls.find(u => u.includes("api-wa.co")) ??
    allUrls.find(u => u.includes("serri")) ??
    allUrls[allUrls.length - 1] ??
    "https://backend.api-wa.co/campaign/serri-india/api/v2";

  // Extract -d / --data JSON body.
  // Strategy: find "-d '" then grab everything up to the LAST single-quote before optional whitespace+url/end.
  // This handles: URL at end, URL in middle, multiline bodies, extra fields like "buttons", "attributes".
  let jsonStr = "";
  const dMatch = raw.match(/(?:-d|--data(?:-raw)?)\s+'/);
  if (dMatch && dMatch.index !== undefined) {
    const after = raw.slice(dMatch.index + dMatch[0].length);
    const closeIdx = after.lastIndexOf("'");
    if (closeIdx !== -1) jsonStr = after.slice(0, closeIdx);
  }
  // Fallback: try double-quoted body or bare JSON object
  if (!jsonStr) {
    const dq = raw.match(/(?:-d|--data(?:-raw)?)\s+"([\s\S]+?)"/);
    if (dq) jsonStr = dq[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  if (!jsonStr) {
    const brace = raw.match(/(\{[\s\S]+\})/);
    if (brace) jsonStr = brace[1];
  }

  if (!jsonStr.trim()) return { ...empty, endpoint, error: "Could not find JSON body in cURL. Make sure it contains -d '{ ... }'" };

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(jsonStr);
  } catch {
    return { ...empty, endpoint, error: "JSON body could not be parsed — check for syntax errors in the JSON." };
  }

  const apiKey = (body.apiKey as string) ?? "";
  const campaignName = (body.campaignName as string) ?? "";
  const userName = (body.userName as string) ?? "";
  const source = (body.source as string) ?? "";
  const params: string[] = Array.isArray(body.templateParams)
    ? (body.templateParams as string[]).map(String)
    : [];
  const media = (body.media && typeof body.media === "object" && !Array.isArray(body.media) && Object.keys(body.media as object).length > 0)
    ? (body.media as Record<string, unknown>)
    : null;

  return {
    endpoint: endpoint || "https://backend.api-wa.co/campaign/serri-india/api/v2",
    apiKey, campaignName, userName, source,
    paramCount: params.length,
    paramExamples: params,
    hasMedia: !!media,
    mediaSpec: media,
  };
}

// ─── Variable helper ──────────────────────────────────────────────────────────
function extractTokens(text: string): string[] {
  const m = text.match(/\$([A-Za-z][A-Za-z0-9_]*)/g) ?? [];
  return [...new Set(m.map((t) => t.slice(1)))];
}

interface VarRow {
  name: string;
  required: boolean;
  fallbackAllowed: boolean;
  fallbackValue: string;
  usedIn: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NewTemplatePage() {
  const router = useRouter();

  const [curlText, setCurlText] = useState("");
  const [parsed, setParsed] = useState<ParsedCurl | null>(null);
  const [step, setStep] = useState<"curl" | "body">("curl");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [mediaUrlVar, setMediaUrlVar] = useState("MediaUrl");
  const [mediaFilename, setMediaFilename] = useState("document");
  const [variables, setVariables] = useState<VarRow[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Auto-detect variables from body
  useEffect(() => {
    const tokens = extractTokens(bodyText);
    setVariables((prev) => {
      const byName = new Map(prev.map((v) => [v.name, v]));
      const next: VarRow[] = tokens.map((t) =>
        byName.get(t) ?? { name: t, required: true, fallbackAllowed: true, fallbackValue: "", usedIn: "text" }
      );
      for (const v of prev) if (!tokens.includes(v.name)) next.push(v);
      return next;
    });
  }, [bodyText]);

  // When media URL var is named and not yet in variables, add it
  useEffect(() => {
    if (!parsed?.hasMedia || !mediaUrlVar) return;
    setVariables((prev) => {
      if (prev.some((v) => v.name === mediaUrlVar)) return prev;
      return [...prev, { name: mediaUrlVar, required: true, fallbackAllowed: false, fallbackValue: "", usedIn: "media_url" }];
    });
  }, [mediaUrlVar, parsed?.hasMedia]);

  function handleParse() {
    if (!curlText.trim()) { setError("Paste a cURL command first."); return; }
    const p = parseCurl(curlText);
    setParsed(p);
    if (p.error) { setError(p.error); return; }
    setError("");
    // Pre-fill template name from campaign name
    if (!name && p.campaignName) setName(p.campaignName.replace(/_/g, " "));
    setStep("body");
  }

  function setVar(nameKey: string, patch: Partial<VarRow>) {
    setVariables((prev) => prev.map((v) => (v.name === nameKey ? { ...v, ...patch } : v)));
  }
  function removeVar(nameKey: string) {
    setVariables((prev) => prev.filter((v) => v.name !== nameKey));
  }
  function addVar() {
    setVariables((prev) => [...prev, { name: `Var${prev.length + 1}`, required: true, fallbackAllowed: true, fallbackValue: "", usedIn: "text" }]);
  }

  const preview = bodyText.replace(/\$([A-Za-z][A-Za-z0-9_]*)/g, (_, t) => `{${t}}`);
  const textVars = variables.filter((v) => v.usedIn !== "media_url");
  const templateParamOrder = textVars.map((v) => v.name);

  async function save() {
    if (!name.trim()) { setError("Template name is required."); return; }
    if (!parsed) { setError("Parse a cURL first."); return; }
    if (!parsed.campaignName) { setError("No campaignName found in the cURL JSON body."); return; }
    if (!bodyText.trim()) { setError("Body text is required."); return; }
    setError("");
    setSaving(true);

    try {
      // 1. Create (or reuse) the CampaignDefinition
      const messageType = parsed.hasMedia ? "TEXT_DOCUMENT" : "TEXT";
      const mediaSpec = parsed.hasMedia
        ? { required: true, urlVar: mediaUrlVar, staticFilename: mediaFilename }
        : {};

      const defRes = await fetch("/api/campaign-definitions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignName: parsed.campaignName,
          endpoint: parsed.endpoint,
          apiKey: parsed.apiKey,
          userName: parsed.userName,
          source: parsed.source,
          messageType,
          templateParamOrder,
          mediaSpec: parsed.hasMedia ? mediaSpec : {},
        }),
      });
      if (!defRes.ok) {
        const d = await defRes.json().catch(() => ({}));
        throw new Error(d.error ?? `Definition error HTTP ${defRes.status}`);
      }
      const { definition } = await defRes.json();

      // 2. Create the Template
      const tmplRes = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          campaignDefinitionId: definition.id,
          messageType,
          bodyText,
          mediaSpec,
          variables: variables.map((v) => ({
            name: v.name,
            required: v.required,
            fallbackAllowed: v.fallbackAllowed,
            fallbackValue: v.fallbackValue || null,
            usedIn: v.usedIn,
          })),
        }),
      });
      if (!tmplRes.ok) {
        const d = await tmplRes.json().catch(() => ({}));
        throw new Error(d.error ?? `Template error HTTP ${tmplRes.status}`);
      }

      router.push("/templates");
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">← Back</button>
        <h1 className="text-2xl font-semibold">New Template</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Step 1: Paste cURL ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            Step 1 — Paste your Serri cURL
          </h2>
          {parsed && !parsed.error && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">✓ Parsed</span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Copy the <strong>Test cURL</strong> from your Serri campaign dashboard and paste it below.
          We extract the API key, campaign name, param count, and media settings automatically.
        </p>
        <textarea
          value={curlText}
          onChange={(e) => { setCurlText(e.target.value); setParsed(null); setStep("curl"); }}
          rows={5}
          placeholder={`curl -X POST "https://backend.api-wa.co/campaign/serri-india/api/v2" \\
  -H "Content-Type: application/json" \\
  -d '{
    "campaignName": "your_campaign_name",
    "destination": "917xxxxxxxxx",
    "userName": "Your Name",
    "source": "form",
    "templateParams": ["Sample Value 1", "Sample Value 2"],
    "media": {},
    "apiKey": "sk_live_xxxxx"
  }'`}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono focus:border-green-500 focus:outline-none"
        />
        <button
          onClick={handleParse}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Parse cURL →
        </button>

        {/* Parsed summary */}
        {parsed && !parsed.error && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2 text-sm">
            <p className="font-medium text-green-800">Extracted from cURL:</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
              <span className="text-gray-500">Campaign name</span>
              <span className="font-mono font-medium">{parsed.campaignName || "—"}</span>
              <span className="text-gray-500">API key</span>
              <span className="font-mono">{parsed.apiKey ? `••••••${parsed.apiKey.slice(-4)}` : "—"}</span>
              <span className="text-gray-500">Endpoint</span>
              <span className="font-mono truncate">{parsed.endpoint}</span>
              <span className="text-gray-500">Template params</span>
              <span>{parsed.paramCount} positional {parsed.paramCount === 1 ? "param" : "params"}
                {parsed.paramExamples.length > 0 && <span className="text-gray-400 ml-1">({parsed.paramExamples.join(", ")})</span>}
              </span>
              <span className="text-gray-500">Media / document</span>
              <span>{parsed.hasMedia ? "✓ Yes" : "No"}</span>
              {parsed.userName && <><span className="text-gray-500">userName</span><span>{parsed.userName}</span></>}
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: Template details (shown after parse) ── */}
      {step === "body" && parsed && !parsed.error && (
        <>
          {/* Basic info */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Step 2 — Template Details</h2>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Template Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Placement Reminder"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional short description"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Body text */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Message Body</h2>
            {parsed.paramCount > 0 && (
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                Your cURL has <strong>{parsed.paramCount} positional param{parsed.paramCount > 1 ? "s" : ""}</strong>
                {parsed.paramExamples.length > 0 && <> (example: <em>{parsed.paramExamples.join(", ")}</em>)</>}.
                Use <code className="bg-blue-100 px-1 rounded font-mono">$VariableName</code> tokens in the body below — the order you write them is the order sent to Serri.
              </div>
            )}
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={5}
              placeholder={"Hi $FirstName,\n\nYour $Course program starts on $StartDate. See you there!"}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-green-500 focus:outline-none"
            />
            {bodyText && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">Preview</p>
                <div className="rounded-lg bg-[#dcf8c6] px-4 py-3 text-sm whitespace-pre-wrap font-sans shadow-sm">
                  {preview}
                </div>
              </div>
            )}
            {templateParamOrder.length > 0 && (
              <div className="text-xs text-gray-400">
                Serri <code className="font-mono">templateParams</code> order:&nbsp;
                <span className="font-mono">[{templateParamOrder.map((n) => `"${n}"`).join(", ")}]</span>
              </div>
            )}
          </div>

          {/* Media settings */}
          {parsed.hasMedia && (
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Media / Document</h2>
              <p className="text-xs text-gray-500">Your cURL includes a media payload. Which CSV column holds the file URL?</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">CSV column variable name *</label>
                  <input
                    value={mediaUrlVar}
                    onChange={(e) => setMediaUrlVar(e.target.value)}
                    placeholder="e.g. PdfUrl"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Static filename for download</label>
                  <input
                    value={mediaFilename}
                    onChange={(e) => setMediaFilename(e.target.value)}
                    placeholder="e.g. brochure"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Variables */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                Variables <span className="text-gray-300 font-normal">({variables.length} detected)</span>
              </h2>
              <button onClick={addVar} className="text-xs text-green-700 hover:underline">+ Add variable</button>
            </div>
            {variables.length === 0 && (
              <p className="text-sm text-gray-400">No variables yet — add <code className="font-mono bg-gray-100 px-1 rounded">$Token</code> placeholders to the body text above.</p>
            )}
            {variables.map((v) => (
              <div key={v.name} className="grid grid-cols-12 gap-2 items-start border-t border-gray-100 pt-3">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input value={v.name} onChange={(e) => setVar(v.name, { name: e.target.value })}
                    className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:border-green-500 focus:outline-none" />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-400 mb-1">Fallback value</label>
                  <input value={v.fallbackValue} onChange={(e) => setVar(v.name, { fallbackValue: e.target.value })}
                    placeholder="(none)"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-green-500 focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Used in</label>
                  <select value={v.usedIn} onChange={(e) => setVar(v.name, { usedIn: e.target.value })}
                    className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-green-500 focus:outline-none">
                    <option value="text">text</option>
                    <option value="media_url">media_url</option>
                    <option value="filename">filename</option>
                  </select>
                </div>
                <div className="col-span-2 flex flex-col gap-1 pt-5">
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={v.required} onChange={(e) => setVar(v.name, { required: e.target.checked })} className="rounded" />
                    Required
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={v.fallbackAllowed} onChange={(e) => setVar(v.name, { fallbackAllowed: e.target.checked })} className="rounded" />
                    Allow fallback
                  </label>
                </div>
                <div className="col-span-2 pt-5">
                  <button onClick={() => removeVar(v.name)} className="text-xs text-red-400 hover:text-red-600 hover:underline">Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Save */}
          <div className="flex justify-end gap-3 pb-8">
            <button onClick={() => router.back()} className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="rounded-lg bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
              {saving ? "Saving…" : "Create Template"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
