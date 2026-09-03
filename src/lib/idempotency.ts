// Idempotency keys. Spec §50. The BullMQ jobId == this key, so double-click / refresh /
// worker retry / network retry cannot produce a second send.
import crypto from "node:crypto";

/**
 * Deterministic key for a campaign message: same (campaign, recipient) → same key.
 * Enqueuing the same jobId twice is a no-op in BullMQ, and the Message.idempotencyKey
 * unique constraint blocks a duplicate DB row.
 */
export function campaignMessageKey(campaignId: string, campaignRecipientId: string): string {
  return `msg_${campaignId}_${campaignRecipientId}`;
}

/**
 * Test / individual sends are inherently one-off; include a nonce so repeated intentional
 * sends are allowed, but a single user action maps to one key (pass a stable actionId).
 */
export function oneOffKey(prefix: string, actionId: string): string {
  return `${prefix}_${actionId}`;
}

export function randomActionId(): string {
  return crypto.randomUUID();
}
