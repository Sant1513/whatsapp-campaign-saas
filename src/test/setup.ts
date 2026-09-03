// Runs before test modules are imported. Provide a valid encryption key + safe defaults.
import crypto from "node:crypto";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.SERRI_MODE = process.env.SERRI_MODE ?? "dry-run";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret";
