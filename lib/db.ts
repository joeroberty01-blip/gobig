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
  max: 10,
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
