// Background workers. Spec §28, §30, §64. Run as a SEPARATE process: `npm run worker`.
// The frontend never runs the send loop.
import { Worker } from "bullmq";
import {
  connection,
  SEND_QUEUE,
  VALIDATE_QUEUE,
  SCHEDULE_QUEUE,
  type SendJobData,
  type ValidateJobData,
  type ScheduleJobData,
} from "../lib/queue/queues";
import { processSendJob } from "../lib/services/send";
import { launchCampaign } from "../lib/services/prepare";
import { importAndValidate } from "../lib/services/import";
import { getFile } from "../lib/storage";
import { parseFile } from "../lib/csv/parse";
import { prisma } from "../lib/db";
import { env } from "../lib/env";

console.log(`[worker] starting — SERRI_MODE=${env.SERRI_MODE}, concurrency=${env.SEND_CONCURRENCY}`);

const sendWorker = new Worker<SendJobData>(
  SEND_QUEUE,
  async (job) => processSendJob(job.data, job.attemptsMade),
  { connection, concurrency: env.SEND_CONCURRENCY },
);

const validateWorker = new Worker<ValidateJobData>(
  VALIDATE_QUEUE,
  async (job) => {
    const imp = await prisma.import.findFirst({ where: { id: job.data.importId } });
    if (!imp) return { skipped: true };
    const buf = await getFile(imp.storageKey);
    const table = parseFile(imp.filename, buf.buffer as ArrayBuffer);
    return importAndValidate(
      {
        organizationId: job.data.organizationId,
        campaignId: job.data.campaignId,
        filename: imp.filename,
        storageKey: imp.storageKey,
        headers: table.headers,
        rows: table.rows,
      },
      "system",
    );
  },
  { connection, concurrency: 2 },
);

const scheduleWorker = new Worker<ScheduleJobData>(
  SCHEDULE_QUEUE,
  async (job) => {
    // Fire time reached — launch (idempotent). Spec §30.
    return launchCampaign(job.data.organizationId, job.data.campaignId, "scheduler");
  },
  { connection, concurrency: 2 },
);

for (const [name, w] of [
  ["send", sendWorker],
  ["validate", validateWorker],
  ["schedule", scheduleWorker],
] as const) {
  w.on("failed", (job, err) => console.error(`[worker:${name}] job ${job?.id} failed:`, err.message));
  w.on("completed", (job) => console.log(`[worker:${name}] job ${job.id} completed`));
}

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.all([sendWorker.close(), validateWorker.close(), scheduleWorker.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
