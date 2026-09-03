import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";
import { assertUploadAllowed, putFile } from "@/lib/storage";
import { parseFile } from "@/lib/csv/parse";
import { autoMatch } from "@/lib/variables/engine";
import { importAndValidate } from "@/lib/services/import";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCap("campaign:audience");
  const { id } = await params;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw Object.assign(new Error("No file uploaded"), { status: 400 });

  assertUploadAllowed(file.name, file.size);
  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await putFile(ctx.organizationId, file.name, buf);

  const table = parseFile(file.name, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  if (table.totalRows === 0) throw Object.assign(new Error("File has no data rows"), { status: 422 });

  // Auto-map on first import if the campaign has no mapping yet (spec §12).
  const campaign = await ctx.db.campaign.findFirst({
    where: { id },
    include: { templateVersion: { include: { variables: true } } },
  });
  if (!campaign) throw Object.assign(new Error("Campaign not found"), { status: 404 });

  const currentMapping = (campaign.fieldMapping ?? {}) as Record<string, string>;
  if (Object.keys(currentMapping).length === 0 && campaign.templateVersion) {
    const varNames = campaign.templateVersion.variables.map((v: any) => v.name);
    const auto = autoMatch([...varNames, "Phone"], table.headers);
    await ctx.db.campaign.update({ where: { id }, data: { fieldMapping: auto } });
  }

  const result = await importAndValidate(
    {
      organizationId: ctx.organizationId,
      campaignId: id,
      filename: file.name,
      storageKey: stored.key,
      headers: table.headers,
      rows: table.rows,
    },
    ctx.userId,
  );

  return json({ ...result, headers: table.headers });
});
