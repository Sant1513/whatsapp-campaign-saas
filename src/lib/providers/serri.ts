// SerriProvider — the concrete adapter. Spec §5, §7, §48, §49, §71.
// Defaults to dry-run: builds+validates the payload but does NOT transmit unless SERRI_MODE=live.
import { env } from "../env";
import type {
  MessagingProvider,
  OutboundMessage,
  SendResult,
  StatusResult,
  ValidationOutcome,
  WebhookEvent,
  ErrorClass,
} from "./types";
import { interpolate, type ResolvedVariable } from "../variables/engine";

// ---- Definition spec (the extensible payload contract, stored on CampaignDefinition) ----
export interface DefinitionSpec {
  serriCampaignName: string;
  userName: string;
  source: string;
  templateParamOrder: string[]; // ordered variable names → templateParams
  media?: {
    required: boolean;
    urlVar?: string; // variable that holds the media URL
    filenameVar?: string;
    staticUrl?: string;
    staticFilename?: string;
  };
  buttons?: unknown[];
  carouselCards?: unknown[];
  location?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

const DRY_RUN_HEADER = "x-dry-run";

/** Build the exact Serri body from a definition + resolved variables. Pure. Spec §7, §72. */
export function buildSerriPayload(
  spec: DefinitionSpec,
  destination: string,
  vars: Record<string, ResolvedVariable>,
  fallbacks: Record<string, string>,
): Record<string, unknown> {
  const templateParams = spec.templateParamOrder.map((name) => {
    const v = vars[name];
    return v && v.value !== null ? v.value : `$${name}`;
  });

  let media: Record<string, unknown> = {};
  if (spec.media) {
    const url = spec.media.urlVar
      ? vars[spec.media.urlVar]?.value ?? spec.media.staticUrl
      : spec.media.staticUrl;
    if (url) {
      const filename = spec.media.filenameVar
        ? interpolate(String(vars[spec.media.filenameVar]?.value ?? spec.media.staticFilename ?? "file"), vars)
        : spec.media.staticFilename ?? "file";
      media = { url, filename };
    }
  }

  return {
    // apiKey injected by the transport layer at send time, never here / never to client
    campaignName: spec.serriCampaignName,
    destination,
    userName: spec.userName,
    templateParams,
    source: spec.source,
    media,
    buttons: spec.buttons ?? [],
    carouselCards: spec.carouselCards ?? [],
    location: spec.location ?? {},
    attributes: spec.attributes ?? {},
    paramsFallbackValue: fallbacks,
  };
}

/** Classify an HTTP status for retry decisions. Spec §29, §49. */
export function classifyStatus(status: number): ErrorClass {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return "TRANSIENT";
  }
  if (status >= 400 && status < 500) return "PERMANENT"; // 400/401/403/404/409/422
  if (status >= 200 && status < 300) return "UNKNOWN"; // caller decides SENT
  return "UNKNOWN";
}

/** Redact secrets from anything we persist/log. Spec §46, §65, §70-R4. */
export function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...payload };
  if ("apiKey" in clone) clone.apiKey = "__REDACTED__";
  return clone;
}

export class SerriProvider implements MessagingProvider {
  async validateConfiguration(input: { endpoint: string; apiKey: string }): Promise<ValidationOutcome> {
    const errors: string[] = [];
    try {
      const u = new URL(input.endpoint);
      if (u.protocol !== "https:") errors.push("Endpoint must be HTTPS");
    } catch {
      errors.push("Endpoint is not a valid URL");
    }
    if (!input.apiKey || input.apiKey.length < 8) errors.push("API key looks invalid");
    return { ok: errors.length === 0, errors };
  }

  validatePayload(payload: Record<string, unknown>): ValidationOutcome {
    const errors: string[] = [];
    if (!payload.campaignName) errors.push("campaignName is required");
    if (!payload.destination || !/^\d{8,15}$/.test(String(payload.destination))) {
      errors.push("destination must be E.164 digits");
    }
    if (!Array.isArray(payload.templateParams)) errors.push("templateParams must be an array");
    // any unresolved $Token in templateParams means a missing required variable slipped through
    if (Array.isArray(payload.templateParams)) {
      const unresolved = (payload.templateParams as unknown[]).filter(
        (p) => typeof p === "string" && /^\$[A-Za-z_]/.test(p),
      );
      if (unresolved.length) errors.push(`unresolved variables: ${unresolved.join(", ")}`);
    }
    return { ok: errors.length === 0, errors };
  }

  async sendMessage(msg: OutboundMessage, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<SendResult> {
    return this.#transmit(msg, false, opts);
  }

  async sendTestMessage(msg: OutboundMessage, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<SendResult> {
    return this.#transmit(msg, true, opts);
  }

  async #transmit(
    msg: OutboundMessage,
    isTest: boolean,
    opts: { fetchImpl?: typeof fetch; timeoutMs?: number },
  ): Promise<SendResult> {
    const start = Date.now();
    const body = { apiKey: msg.apiKey, ...msg.payload };

    const pre = this.validatePayload(msg.payload);
    if (!pre.ok) {
      return { outcome: "FAILED", errorClass: "PERMANENT", reason: pre.errors.join("; "), durationMs: Date.now() - start };
    }

    // DRY-RUN: never transmit. Payload is fully built & validated. (default mode)
    if (env.SERRI_MODE !== "live") {
      return {
        outcome: "SENT",
        httpStatus: 200,
        providerRef: `dryrun_${msg.idempotencyKey}`,
        responseBody: { dryRun: true, isTest, note: "SERRI_MODE=dry-run; not transmitted" },
        durationMs: Date.now() - start,
      };
    }

    const doFetch = opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
    try {
      const res = await doFetch(msg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": msg.idempotencyKey, // use provider idempotency if supported (§50)
          ...(isTest ? { [DRY_RUN_HEADER]: "false" } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const cls = classifyStatus(res.status);
      let parsed: unknown = undefined;
      try {
        parsed = await res.json();
      } catch {
        // Malformed/empty response body (spec §49): don't assume anything.
        if (res.ok) {
          return { outcome: "UNKNOWN", httpStatus: res.status, errorClass: "UNKNOWN", reason: "malformed_response", durationMs: Date.now() - start };
        }
      }

      if (res.ok) {
        return {
          outcome: "SENT",
          httpStatus: res.status,
          providerRef: extractRef(parsed) ?? undefined,
          responseBody: sanitize(parsed),
          durationMs: Date.now() - start,
        };
      }

      return {
        outcome: "FAILED",
        httpStatus: res.status,
        errorClass: cls,
        reason: `serri_http_${res.status}`,
        responseBody: sanitize(parsed),
        durationMs: Date.now() - start,
      };
    } catch (e: any) {
      // Timeout / network failure: NEVER assume "not sent" → UNKNOWN (spec §50, §70-R5).
      const timedOut = e?.name === "AbortError";
      return {
        outcome: "UNKNOWN",
        errorClass: "TRANSIENT",
        reason: timedOut ? "timeout" : "network_error",
        durationMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getMessageStatus(_providerRef: string): Promise<StatusResult> {
    // Serri India v2 does not expose a documented status pull in the given cURLs.
    // Until a real endpoint/webhook is wired, do not fabricate delivery info (spec §33, §70-R5).
    return { status: "UNKNOWN" };
  }

  async processWebhook(body: unknown, _headers: Record<string, string>): Promise<WebhookEvent[]> {
    // Placeholder: map a documented Serri webhook to WebhookEvent[] when available.
    // Only real provider confirmation ever sets DELIVERED/READ (spec §33, §70-R5).
    if (!body || typeof body !== "object") return [];
    return [];
  }
}

function extractRef(parsed: unknown): string | undefined {
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const k of ["messageId", "id", "ref", "requestId"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return undefined;
}

function sanitize(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const o = { ...(parsed as Record<string, unknown>) };
  for (const k of Object.keys(o)) {
    if (/key|token|secret|auth/i.test(k)) o[k] = "__REDACTED__";
  }
  return o;
}

export const serriProvider = new SerriProvider();
