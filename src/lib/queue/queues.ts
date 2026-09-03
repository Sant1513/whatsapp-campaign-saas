// BullMQ queues. Spec §28, §64. All campaign sending happens through these — never the browser.
import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "../env";

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const SEND_QUEUE = "campaign-send";
export const VALIDATE_QUEUE = "csv-validate";
export const SCHEDULE_QUEUE = "campaign-schedule";

export interface SendJobData {
  idempotencyKey: string; // == message.idempotencyKey == jobId
  organizationId: string;
  campaignId: string;
}

export interface ValidateJobData {
  importId: string;
  organizationId: string;
  campaignId: string;
}

export interface ScheduleJobData {
  campaignId: string;
  organizationId: string;
}

export const sendQueue = new Queue<SendJobData>(SEND_QUEUE, { connection });
export const validateQueue = new Queue<ValidateJobData>(VALIDATE_QUEUE, { connection });
export const scheduleQueue = new Queue<ScheduleJobData>(SCHEDULE_QUEUE, { connection });

export const sendQueueEvents = new QueueEvents(SEND_QUEUE, { connection });
