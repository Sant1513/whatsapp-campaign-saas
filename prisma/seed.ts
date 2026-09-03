// Seed data. Creates two orgs (for tenant-isolation testing), users of every role, Serri
// connections, campaign definitions, and templates. Run: npm run db:seed
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { encryptSecret, last4 } from "../src/lib/crypto";

export async function seed(prisma: PrismaClient) {
  const pw = await hashPassword("password123");
  const demoKey = "sk_serri_demo_0000000000_ABCD"; // placeholder; replace in the UI for live mode

  // --- Users ---
  const superAdmin = await prisma.user.upsert({
    where: { email: "super@platform.test" },
    update: {},
    create: { email: "super@platform.test", name: "Platform Super Admin", passwordHash: pw, isSuperAdmin: true },
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin@acme.test" }, update: {},
    create: { email: "admin@acme.test", name: "Acme Admin", passwordHash: pw },
  });
  const manager = await prisma.user.upsert({
    where: { email: "manager@acme.test" }, update: {},
    create: { email: "manager@acme.test", name: "Acme Campaign Manager", passwordHash: pw },
  });
  const viewer = await prisma.user.upsert({
    where: { email: "viewer@acme.test" }, update: {},
    create: { email: "viewer@acme.test", name: "Acme Viewer", passwordHash: pw },
  });
  const globexAdmin = await prisma.user.upsert({
    where: { email: "admin@globex.test" }, update: {},
    create: { email: "admin@globex.test", name: "Globex Admin", passwordHash: pw },
  });

  // --- Organizations ---
  const acme = await prisma.organization.upsert({
    where: { slug: "acme" }, update: {},
    create: { name: "Acme Education", slug: "acme", timezone: "Asia/Kolkata" },
  });
  const globex = await prisma.organization.upsert({
    where: { slug: "globex" }, update: {},
    create: { name: "Globex Institute", slug: "globex", timezone: "Asia/Kolkata" },
  });

  // --- Memberships ---
  const memberships: [string, string, "ORG_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER"][] = [
    [acme.id, admin.id, "ORG_ADMIN"],
    [acme.id, manager.id, "CAMPAIGN_MANAGER"],
    [acme.id, viewer.id, "VIEWER"],
    [globex.id, globexAdmin.id, "ORG_ADMIN"],
    // Super admin is also given org memberships so the app shell + org switcher work today.
    // A dedicated cross-org platform console (spec §66) is a documented next step.
    [acme.id, superAdmin.id, "ORG_ADMIN"],
    [globex.id, superAdmin.id, "ORG_ADMIN"],
  ];
  for (const [orgId, userId, role] of memberships) {
    await prisma.organizationUser.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      update: { role },
      create: { organizationId: orgId, userId, role },
    });
  }

  // --- Serri connection (Acme) ---
  const conn = await prisma.serriConnection.create({
    data: {
      organizationId: acme.id,
      name: "Admissions WhatsApp",
      endpoint: "https://backend.api-wa.co/campaign/serri-india/api/v2",
      apiKeyCipher: encryptSecret(demoKey),
      apiKeyLast4: last4(demoKey),
      defaultUserName: "Hire From Us",
      defaultSource: "new-landing-page form",
      status: "ACTIVE",
    },
  });
  // Globex gets its own connection (isolation demo)
  await prisma.serriConnection.create({
    data: {
      organizationId: globex.id, name: "Globex WhatsApp",
      endpoint: "https://backend.api-wa.co/campaign/serri-india/api/v2",
      apiKeyCipher: encryptSecret("sk_serri_globex_demo_0000_WXYZ"), apiKeyLast4: "WXYZ",
      defaultUserName: "Globex", defaultSource: "globex form", status: "ACTIVE",
    },
  });

  // --- Campaign definitions (Serri payload contracts) ---
  const textDef = await prisma.campaignDefinition.create({
    data: {
      organizationId: acme.id, name: "Text campaign (FirstName)", serriCampaignName: "zaza1_clone2_1767876912",
      messageType: "TEXT", status: "ACTIVE",
      spec: { templateParamOrder: ["FirstName"] },
    },
  });
  const mediaDef = await prisma.campaignDefinition.create({
    data: {
      organizationId: acme.id, name: "Document campaign (FirstName + PDF)", serriCampaignName: "zaza2",
      messageType: "TEXT_DOCUMENT", status: "ACTIVE",
      spec: { templateParamOrder: ["FirstName"], media: { required: true, urlVar: "PdfUrl", staticFilename: "brochure" } },
    },
  });

  // --- Templates ---
  const placement = await prisma.template.create({
    data: { organizationId: acme.id, name: "Placement Reminder", description: "Reminder about placement program", createdBy: admin.id, status: "ACTIVE" },
  });
  const pv = await prisma.templateVersion.create({
    data: {
      organizationId: acme.id, templateId: placement.id, version: 1, messageType: "TEXT",
      bodyText: "Hi $FirstName,\n\nYour $Course program starts on $StartDate. See you there!",
      campaignDefinitionId: textDef.id, createdBy: admin.id,
      variables: {
        create: [
          { name: "FirstName", required: true, fallbackValue: "user", fallbackAllowed: true, usedIn: "text" },
          { name: "Course", required: true, fallbackValue: null, fallbackAllowed: false, usedIn: "text" },
          { name: "StartDate", required: true, fallbackValue: null, fallbackAllowed: false, usedIn: "text" },
        ],
      },
    },
  });
  await prisma.template.update({ where: { id: placement.id }, data: { currentVersionId: pv.id } });

  const fee = await prisma.template.create({
    data: { organizationId: acme.id, name: "Fee Reminder (with brochure)", description: "Fee reminder + PDF", createdBy: admin.id, status: "ACTIVE" },
  });
  const fv = await prisma.templateVersion.create({
    data: {
      organizationId: acme.id, templateId: fee.id, version: 1, messageType: "TEXT_DOCUMENT",
      bodyText: "Hi $FirstName, please find your fee brochure attached.",
      mediaSpec: { required: true, urlVar: "PdfUrl", staticFilename: "brochure" },
      campaignDefinitionId: mediaDef.id, createdBy: admin.id,
      variables: {
        create: [
          { name: "FirstName", required: true, fallbackValue: "user", fallbackAllowed: true, usedIn: "text" },
          { name: "PdfUrl", required: true, fallbackValue: null, fallbackAllowed: false, usedIn: "media_url" },
        ],
      },
    },
  });
  await prisma.template.update({ where: { id: fee.id }, data: { currentVersionId: fv.id } });

  // --- A few contacts ---
  for (const [name, phone] of [["Rahul Sharma", "917983907047"], ["Priya Verma", "919876543210"]] as const) {
    await prisma.contact.upsert({
      where: { organizationId_phone: { organizationId: acme.id, phone } },
      update: { name }, create: { organizationId: acme.id, name, phone },
    });
  }

  console.log("Seed complete.");
  console.log("Login: admin@acme.test / password123 (Org Admin, Acme)");
  console.log("       manager@acme.test, viewer@acme.test, admin@globex.test, super@platform.test — all password123");
  console.log(`Connection ${conn.name} · Templates: Placement Reminder, Fee Reminder`);
}

// Direct run (`npm run db:seed`) against the configured DATABASE_URL.
import { fileURLToPath } from "node:url";
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const prisma = new PrismaClient();
  seed(prisma)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
