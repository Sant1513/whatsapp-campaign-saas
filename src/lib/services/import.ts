// Import + validate a recipient file into CampaignRecipients. Spec §17-§21.
// Same function is used inline (small files) or from the validate worker (large files, §64).
import { prisma } from "../db";
import { validateBatch, type ValidateOptions } from "../validation/engine";
import { loadCampaignContext } from "./assemble";
import { audit } from "../audit";

export interface ImportInput {
  organizationId: string;
  campaignId: string;
  filename: string;
  storageKey: string;
  headers: string[];
  rows: Record<string, string>[];
  phoneVar?: string;
  nameVar?: string;
}

export async function importAndValidate(input: ImportInput, actorUserId: string) {
  const ctx = await loadCampaignContext(input.organizationId, input.campaignId);

  const mediaSpec = ctx.definitionSpec.media;
  const options: ValidateOptions = {
    variables: ctx.variables,
    mapping: ctx.mapping,
    phoneVar: input.phoneVar ?? "Phone",
    nameVar: input.nameVar,
    media: mediaSpec?.required ? { required: true, urlVar: mediaSpec.urlVar } : undefined,
    allowDuplicates: ctx.campaign.allowDuplicates,
    defaultCountry: "IN",
  };

  const batch = input.rows.map((data, i) => ({ rowNumber: i + 1, data }));
  const { results, summary } = validateBatch(batch, options);

  // Persist import + rows + errors + recipients atomically-ish.
  const imp = await prisma.import.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      filename: input.filename,
      storageKey: input.storageKey,
      headers: input.headers,
      totalRows: summary.uploaded,
      eligibleRows: summary.eligible,
      excludedRows: summary.excluded,
      status: "COMPLETED",
      summary: summary as any,
    },
  });

  // Replace any prior recipients for this campaign (re-upload replaces audience).
  await prisma.campaignRecipient.deleteMany({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });

  for (const r of results) {
    const row = batch[r.rowNumber - 1].data;
    await prisma.$transaction(async (tx) => {
      const importRow = await tx.importRow.create({
        data: { importId: imp.id, rowNumber: r.rowNumber, data: row as any, eligible: r.eligible },
      });
      if (!r.eligible && r.reason) {
        await tx.validationError.create({
          data: {
            importRowId: importRow.id,
            reason: r.reason,
            field: r.field,
            value: r.value,
          },
        });
      }
      await tx.campaignRecipient.create({
        data: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          rowNumber: r.rowNumber,
          destination: r.destination ?? "",
          name: r.name ?? "",
          rawData: row as any,
          resolvedVariables: r.resolvedVariables as any,
          eligible: r.eligible,
          exclusionReason: r.reason,
          exclusionField: r.field,
          exclusionValue: r.value,
        },
      });
    });
  }

  await audit({
    organizationId: input.organizationId,
    userId: actorUserId,
    action: "campaign.import",
    entityType: "campaign",
    entityId: input.campaignId,
    metadata: { filename: input.filename, ...summary },
  });

  return { importId: imp.id, summary };
}
