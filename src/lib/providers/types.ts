// Provider abstraction. Spec §48. The app couples to this interface, not to Serri.

export type SendOutcome = "SENT" | "FAILED" | "UNKNOWN";
export type ErrorClass = "TRANSIENT" | "PERMANENT" | "UNKNOWN";

export interface SendResult {
  outcome: SendOutcome;
  httpStatus?: number;
  errorClass?: ErrorClass;
  providerRef?: string;
  /** sanitized response — never contains secrets */
  responseBody?: unknown;
  reason?: string;
  durationMs?: number;
}

export interface StatusResult {
  status: "SENT" | "DELIVERED" | "READ" | "FAILED" | "UNKNOWN";
  raw?: unknown;
}

export interface WebhookEvent {
  providerRef?: string;
  destination?: string;
  status: "DELIVERED" | "READ" | "FAILED" | "SENT";
  at?: Date;
  raw?: unknown;
}

export interface ValidationOutcome {
  ok: boolean;
  errors: string[];
}

/** Everything the provider needs to send, assembled by the backend (never the browser). */
export interface OutboundMessage {
  apiKey: string; // decrypted only here, in the backend
  endpoint: string;
  payload: Record<string, unknown>; // the exact provider body
  idempotencyKey: string;
}

export interface MessagingProvider {
  validateConfiguration(input: { endpoint: string; apiKey: string }): Promise<ValidationOutcome>;
  validatePayload(payload: Record<string, unknown>): ValidationOutcome;
  sendMessage(msg: OutboundMessage, opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<SendResult>;
  sendTestMessage(msg: OutboundMessage, opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<SendResult>;
  getMessageStatus(providerRef: string): Promise<StatusResult>;
  processWebhook(body: unknown, headers: Record<string, string>): Promise<WebhookEvent[]>;
}
