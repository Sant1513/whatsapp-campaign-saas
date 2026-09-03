// Dev-only: start a real embedded PostgreSQL (no system install) and keep it running.
// Not part of the product — just to demo the app on a machine without Postgres.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const DIR = "./.pgdata";
const PORT = 5433;

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });

  if (!existsSync(DIR)) {
    console.log("[pg] initialising cluster (first run downloads binaries)…");
    await pg.initialise();
  }
  console.log("[pg] starting…");
  await pg.start();
  try {
    await pg.createDatabase("wa_campaigns");
    console.log("[pg] database wa_campaigns created");
  } catch {
    console.log("[pg] database wa_campaigns already exists");
  }
  console.log(`[pg] ready on postgresql://postgres:postgres@localhost:${PORT}/wa_campaigns`);

  const stop = async () => { console.log("[pg] stopping…"); try { await pg.stop(); } catch {} process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30); // keep alive
}

main().catch((e) => { console.error("[pg] error", e); process.exit(1); });
