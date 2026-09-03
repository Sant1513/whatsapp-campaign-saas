export const dynamic = "force-dynamic";
import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";

const schema = z.object({ mapping: z.record(z.string(), z.string()) });

// Save the variable → CSV column mapping. Spec §12.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCap("campaign:audience");
  const { id } = await params;
  const { mapping } = schema.parse(await req.json());
  await ctx.db.campaign.update({ where: { id }, data: { fieldMapping: mapping } });
  return json({ ok: true, mapping });
});
