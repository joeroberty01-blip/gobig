import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Neon's pooler (PgBouncer, transaction mode) has no idle-client timeout; server connections go
// away only when the compute suspends (after 5 min idle) or restarts. Phase 13 measured the old
// 1 s idle timeout re-opening TLS connections on nearly every page (~850 ms extra from Tanzania).
// Now: idle connections live 10 s — warm across one page's queries and quick navigation, far
// inside the suspend window — and every connection is replaced after 60 s so a stale socket
// can't linger. keepAlive detects silently dropped sockets.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  // Phase 16: per-instance pool size; keep (instances × DB_POOL_MAX) under the database's limit.
  max: Math.max(1, Math.min(50, Number(process.env.DB_POOL_MAX) || 10)),
  idleTimeoutMillis: 10_000,
  maxLifetimeSeconds: 60,
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

// Phase 16: public browsing can read from a replica (DATABASE_URL_READ). It may lag the primary by
// a moment, so use it only for data where that's fine (discovery, public profiles) — never for
// anything read back right after a write, permissions or money.
const globalForRead = globalThis as unknown as { prismaRead: PrismaClient | undefined };
export const prismaRead: PrismaClient = process.env.DATABASE_URL_READ?.trim()
  ? (globalForRead.prismaRead ??= new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL_READ,
        max: Math.max(1, Math.min(50, Number(process.env.DB_POOL_MAX) || 10)),
        idleTimeoutMillis: 10_000,
        maxLifetimeSeconds: 60,
        connectionTimeoutMillis: 10_000,
        keepAlive: true,
      }),
    }))
  : prisma;
