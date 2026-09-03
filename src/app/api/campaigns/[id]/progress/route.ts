export const dynamic = "force-dynamic";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";

// Real-time campaign progress via SSE. Spec §62. No page refresh required.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      async function tick() {
        if (closed) return;
        const campaign = await prisma.campaign.findFirst({ where: { id, organizationId: ctx.organizationId } });
        if (!campaign) {
          send({ error: "not_found" });
          controller.close();
          closed = true;
          return;
        }
        const [total, sent, failed, pending, processing] = await Promise.all([
          prisma.message.count({ where: { campaignId: id, organizationId: ctx.organizationId } }),
          prisma.message.count({ where: { campaignId: id, organizationId: ctx.organizationId, status: { in: ["SENT", "DELIVERED", "READ"] } } }),
          prisma.message.count({ where: { campaignId: id, organizationId: ctx.organizationId, status: "FAILED" } }),
          prisma.message.count({ where: { campaignId: id, organizationId: ctx.organizationId, status: "PENDING" } }),
          prisma.message.count({ where: { campaignId: id, organizationId: ctx.organizationId, status: "PROCESSING" } }),
        ]);
        const processed = sent + failed;
        send({ status: campaign.status, total, sent, failed, pending, processing, processed, pct: total ? Math.round((processed / total) * 100) : 0 });

        if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(campaign.status)) {
          controller.close();
          closed = true;
        }
      }

      await tick();
      const interval = setInterval(async () => {
        try {
          await tick();
        } catch {
          clearInterval(interval);
          if (!closed) controller.close();
        }
        if (closed) clearInterval(interval);
      }, 2000);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
