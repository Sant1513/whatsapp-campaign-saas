/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "bullmq",
    "ioredis",
    "@prisma/client",
    "bcryptjs",
    "@electric-sql/pglite",
    "pglite-prisma-adapter",
  ],
};

export default nextConfig;
