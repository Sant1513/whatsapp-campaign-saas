import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildSerriPayload,
  classifyStatus,
  redactPayload,
  SerriProvider,
  type DefinitionSpec,
} from "./serri";
import { env } from "../env";
import type { ResolvedVariable } from "../variables/engine";

const spec: DefinitionSpec = {
  serriCampaignName: "zaza1_clone2_1767876912",
  userName: "Hire From Us",
  source: "new-landing-page form",
  templateParamOrder: ["FirstName"],
};

function vars(v: Record<string, string | null>): Record<string, ResolvedVariable> {
  const out: Record<string, ResolvedVariable> = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = { name: k, value: val, source: val ? "csv" : "missing", ok: val != null };
  }
  return out;
}

describe("buildSerriPayload (spec §7, §72)", () => {
  it("builds the known text payload shape", () => {
    const p = buildSerriPayload(spec, "917983907047", vars({ FirstName: "Rahul" }), { FirstName: "user" });
    expect(p).toMatchObject({
      campaignName: "zaza1_clone2_1767876912",
      destination: "917983907047",
      userName: "Hire From Us",
      templateParams: ["Rahul"],
      source: "new-landing-page form",
      media: {},
      buttons: [],
      paramsFallbackValue: { FirstName: "user" },
    });
    expect("apiKey" in p).toBe(false); // never included in build step (spec §70-R4)
  });

  it("builds a media payload when spec requires media", () => {
    const mediaSpec: DefinitionSpec = {
      ...spec,
      media: { required: true, urlVar: "PdfUrl", staticFilename: "sample_media" },
    };
    const p = buildSerriPayload(
      mediaSpec,
      "917983907047",
      vars({ FirstName: "Rahul", PdfUrl: "https://cdn.example/x.pdf" }),
      { FirstName: "user" },
    );
    expect(p.media).toEqual({ url: "https://cdn.example/x.pdf", filename: "sample_media" });
  });
});

describe("classifyStatus (spec §29, §49)", () => {
  it("marks 429/5xx transient", () => {
    for (const s of [429, 500, 502, 503, 504]) expect(classifyStatus(s)).toBe("TRANSIENT");
  });
  it("marks 4xx permanent", () => {
    for (const s of [400, 401, 403, 404, 409, 422]) expect(classifyStatus(s)).toBe("PERMANENT");
  });
});

describe("redactPayload (spec §70-R4)", () => {
  it("never leaks apiKey", () => {
    expect(redactPayload({ apiKey: "secret", destination: "1" })).toEqual({
      apiKey: "__REDACTED__",
      destination: "1",
    });
  });
});

describe("validatePayload", () => {
  const p = new SerriProvider();
  it("flags unresolved variables (spec §23)", () => {
    const r = p.validatePayload({
      campaignName: "x",
      destination: "917983907047",
      templateParams: ["$FirstName"],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/unresolved/);
  });
  it("passes a complete payload", () => {
    const r = p.validatePayload({
      campaignName: "x",
      destination: "917983907047",
      templateParams: ["Rahul"],
    });
    expect(r.ok).toBe(true);
  });
});

describe("dry-run send never transmits (default)", () => {
  it("returns SENT dryRun without calling fetch", async () => {
    const p = new SerriProvider();
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await p.sendMessage(
      { apiKey: "k", endpoint: "https://x", payload: { campaignName: "x", destination: "917983907047", templateParams: ["Rahul"] }, idempotencyKey: "abc" },
      { fetchImpl },
    );
    expect(called).toBe(false);
    expect(r.outcome).toBe("SENT");
    expect((r.responseBody as any).dryRun).toBe(true);
  });
});

describe("live send outcomes (spec §49, §50, §70-R5)", () => {
  beforeEach(() => { (env as any).SERRI_MODE = "live"; });
  afterEach(() => { (env as any).SERRI_MODE = "dry-run"; });

  const good = { campaignName: "x", destination: "917983907047", templateParams: ["Rahul"] };
  const msg = (k = "id1") => ({ apiKey: "k", endpoint: "https://x", payload: good, idempotencyKey: k });

  it("200 → SENT", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })) as unknown as typeof fetch;
    const r = await new SerriProvider().sendMessage(msg(), { fetchImpl });
    expect(r.outcome).toBe("SENT");
    expect(r.providerRef).toBe("m1");
  });
  it("401 → FAILED permanent", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const r = await new SerriProvider().sendMessage(msg(), { fetchImpl });
    expect(r.outcome).toBe("FAILED");
    expect(r.errorClass).toBe("PERMANENT");
  });
  it("502 → FAILED transient", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 502 })) as unknown as typeof fetch;
    const r = await new SerriProvider().sendMessage(msg(), { fetchImpl });
    expect(r.outcome).toBe("FAILED");
    expect(r.errorClass).toBe("TRANSIENT");
  });
  it("timeout → UNKNOWN, never assumed not-sent", async () => {
    const fetchImpl = (async () => {
      const e: any = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }) as unknown as typeof fetch;
    const r = await new SerriProvider().sendMessage(msg(), { fetchImpl });
    expect(r.outcome).toBe("UNKNOWN");
    expect(r.reason).toBe("timeout");
  });
  it("malformed 200 body → UNKNOWN", async () => {
    const fetchImpl = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const r = await new SerriProvider().sendMessage(msg(), { fetchImpl });
    expect(r.outcome).toBe("UNKNOWN");
    expect(r.reason).toBe("malformed_response");
  });
});
