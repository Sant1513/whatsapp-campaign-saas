// Scheduler safety-net poller. Spec §30. Delayed BullMQ jobs are the primary mechanism; this
// poller catches any due scheduled_jobs that were missed (e.g. Redis restart). Runs standalone.
import { prisma } from "../lib/db";
import { scheduleQueue } from "../lib/queue/queues";

const POLL_MS = 30_000;

async function tick() {
  const now = new Date();
  const due = await prisma.scheduledJob.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    take: 100,
  });
  for (const job of due) {
    await scheduleQueue.add(
      "launch",
      { campaignId: job.campaignId, organizationId: job.organizationId },
      { jobId: `sched_${job.id}` },
    );
    await prisma.scheduledJob.update({ where: { id: job.id }, data: { status: "FIRED" } });
    console.log(`[scheduler] fired campaign ${job.campaignId}`);
  }
}

console.log("[scheduler] polling every 30s");
setInterval(() => tick().catch((e) => console.error("[scheduler] tick error", e)), POLL_MS);
tick().catch((e) => console.error("[scheduler] initial tick error", e));
