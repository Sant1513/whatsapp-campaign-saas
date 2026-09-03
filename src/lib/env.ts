// Centralized, validated environment access. Never read process.env elsewhere.
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(1).default("dev-insecure-secret-change-me"),
  ENCRYPTION_KEY: z.string().min(1).optional(),
  SERRI_MODE: z.enum(["dry-run", "live"]).default("dry-run"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  SEND_CONCURRENCY: z.coerce.number().int().positive().default(5),
  SEND_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // Dev/demo only: process sends inline (no Redis/BullMQ). Never enable in production.
  DEMO_INLINE_SEND: z
    .enum(["0", "1", "true", "false"])
    .default("0")
    .transform((v) => v === "1" || v === "true"),
  // Dev/demo only: use in-process PGlite (WASM Postgres) instead of a real server.
  DEMO_DB: z.enum(["off", "pglite"]).default("off"),
  DEMO_PGLITE_DIR: z.string().default("./.pgdata-lite"),
});

export const env = schema.parse(process.env);

export const isLiveSending = () => env.SERRI_MODE === "live";
