// No-install demo bootstrap: create a fresh PGlite database, apply the schema DDL, and seed it.
// Runs in its own process; the dev server then opens the same ./.pgdata-lite directory.
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { seed } from "../prisma/seed";

const DIR = process.env.DEMO_PGLITE_DIR || "./.pgdata-lite";

async function main() {
  if (existsSync(DIR)) {
    console.log(`[bootstrap] removing existing ${DIR}`);
    rmSync(DIR, { recursive: true, force: true });
  }
  console.log("[bootstrap] creating PGlite database…");
  const pg = new PGlite(DIR);
  await pg.waitReady;

  const ddl = readFileSync("prisma/ddl.sql", "utf8");
  console.log("[bootstrap] applying schema…");
  await pg.exec(ddl);

  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) } as any);
  console.log("[bootstrap] seeding…");
  await seed(prisma);
  await prisma.$disconnect();
  await pg.close();
  console.log("[bootstrap] done.");
}

main().catch((e) => { console.error("[bootstrap] error", e); process.exit(1); });
