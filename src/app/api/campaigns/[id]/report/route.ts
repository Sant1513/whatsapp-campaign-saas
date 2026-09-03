import { route, json } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { toCsv } from "@/lib/reports/export";

// Campaign report + recipient table + CSV export. Spec §38, §40, §41.
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const filter = url.searchParams.get("filter") ?? "all";
  const search = url.searchParams.get("q") ?? "";

  const [uploaded, eligible, excluded, sent, delivered, read, failed, pending] = await Promise.all([
    ctx.db.campaignRecipient.count({ where: { campaignId: id } }),
    ctx.db.campaignRecipient.count({ where: { campaignId: id, eligible: true } }),
    ctx.db.campaignRecipient.count({ where: { campaignId: id, eligible: false } }),
    ctx.db.message.count({ where: { campaignId: id, status: { in: ["SENT", "DELIVERED", "READ"] } } }),
    ctx.db.message.count({ where: { campaignId: id, status: { in: ["DELIVERED", "READ"] } } }),
    ctx.db.message.count({ where: { campaignId: id, status: "READ" } }),
    ctx.db.message.count({ where: { campaignId: id, status: "FAILED" } }),
    ctx.db.message.count({ where: { campaignId: id, status: { in: ["PENDING", "PROCESSING"] } } }),
  ]);

  const statusFilter: Record<string, any> = {
    sent: { status: { in: ["SENT", "DELIVERED", "READ"] } },
    delivered: { status: { in: ["DELIVERED", "READ"] } },
    read: { status: "READ" },
    failed: { status: "FAILED" },
    pending: { status: { in: ["PENDING", "PROCESSING"] } },
  };

  const messages = await ctx.db.message.findMany({
    where: {
      campaignId: id,
      ...(statusFilter[filter] ?? {}),
      ...(search ? { OR: [{ destination: { contains: search } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: format ? 100000 : 500,
    include: { campaignRecipient: { select: { name: true } } },
  });

  const rows = messages.map((m: any) => ({
    name: m.campaignRecipient?.name ?? "",
    phone: m.destination,
    status: m.status,
    reason: m.failureReason ?? "",
    sentAt: m.sentAt?.toISOString() ?? "",
    deliveredAt: m.deliveredAt?.toISOString() ?? "",
    readAt: m.readAt?.toISOString() ?? "",
    attempts: m.attemptCount,
  }));

  if (format === "csv") {
    const csv = toCsv(rows);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="campaign-${id}-report.csv"` },
    });
  }

  return json({
    summary: { uploaded, eligible, excluded, sent, delivered, read, failed, pending },
    recipients: rows,
  });
});
