// URL validation + pluggable resolver layer. Spec §15, §16, §51.
// Two phases:
//   1. syntactic  — pure, always runs (no network)
//   2. reachable  — network HEAD/GET, run in worker/service before send
// The resolver layer can transform provider-specific "open/view" links, but ONLY when the
// transform is safe & known. Otherwise the record is marked invalid rather than guessed (§16).

export interface UrlSyntaxResult {
  valid: boolean;
  reason?: string;
  url?: string;
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function validateUrlSyntax(raw: unknown): UrlSyntaxResult {
  if (raw === null || raw === undefined) return { valid: false, reason: "empty" };
  const s = String(raw).trim();
  if (!s) return { valid: false, reason: "empty" };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { valid: false, reason: "malformed_url" };
  }
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) {
    return { valid: false, reason: "unsupported_protocol" };
  }
  return { valid: true, url: u.toString() };
}

// --- Resolver layer (extensible) ---------------------------------------------

export interface UrlResolver {
  /** Return true if this resolver recognizes the URL and can transform it safely. */
  matches(url: URL): boolean;
  /** Transform an open/view URL to a direct-download URL. Throw to mark invalid. */
  resolve(url: URL): string;
}

/** No transform providers are enabled by default — we never silently modify arbitrary URLs. */
const resolvers: UrlResolver[] = [];

export function registerResolver(r: UrlResolver) {
  resolvers.push(r);
}

export interface ResolveResult {
  ok: boolean;
  url?: string;
  reason?: string;
}

export function resolveMediaUrl(raw: string): ResolveResult {
  const syn = validateUrlSyntax(raw);
  if (!syn.valid) return { ok: false, reason: syn.reason };
  const u = new URL(syn.url!);
  for (const r of resolvers) {
    if (r.matches(u)) {
      try {
        return { ok: true, url: r.resolve(u) };
      } catch {
        // §16: if a provider-specific transform can't be safely determined → invalid.
        return { ok: false, reason: "unresolvable_provider_url" };
      }
    }
  }
  // No resolver claimed it — pass through unchanged (we do not guess).
  return { ok: true, url: u.toString() };
}

export type ReachabilityResult =
  | { reachable: true; contentType?: string; status: number }
  | { reachable: false; reason: string; status?: number };

/** Network check — run server-side only, before send. Follows redirects, times out. */
export async function checkReachable(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ReachabilityResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    let res = await doFetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    // Some hosts don't support HEAD — fall back to a ranged GET.
    if (res.status === 405 || res.status === 501) {
      res = await doFetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { Range: "bytes=0-0" },
        signal: controller.signal,
      });
    }
    if (res.status >= 200 && res.status < 400) {
      return {
        reachable: true,
        status: res.status,
        contentType: res.headers.get("content-type") ?? undefined,
      };
    }
    return { reachable: false, reason: `http_${res.status}`, status: res.status };
  } catch (e: any) {
    return { reachable: false, reason: e?.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(t);
  }
}
