import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// The Postgres pooler drops idle connections on its own schedule. Without these settings the pg
// pool keeps handing out sockets the server has already closed, which surfaces as an intermittent
// `P1017 ConnectionClosed` on a page that worked moments earlier. Prisma's own guidance for this
// server is max 10 connections and "idle timeout to the smallest positive value supported", so
// idle clients are retired long before the server can close them out from under us.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 1_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
