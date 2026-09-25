import "dotenv/config";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/services/auth";

/**
 * Creates the first SUPER_ADMIN from SUPER_ADMIN_NAME / _EMAIL / _PASSWORD in the environment.
 * No password is ever written in code. Refuses to touch an existing non-super-admin account with
 * the same email, and does nothing if that super admin already exists.
 */
async function main() {
  const name = process.env.SUPER_ADMIN_NAME?.trim();
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "";

  if (!name || !email || !password) {
    throw new Error("Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD first.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("SUPER_ADMIN_EMAIL is not a valid email.");
  if (password.length < 12) throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");

  const existing = await prisma.user.findUnique({ where: { email }, select: { role: true } });
  if (existing?.role === "SUPER_ADMIN") {
    console.log(`Super admin ${email} already exists — nothing changed.`);
    return;
  }
  if (existing) throw new Error(`${email} belongs to an existing ${existing.role} account; refusing to change it.`);

  await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: "SUPER_ADMIN", locale: "en" },
  });
  console.log(`Super admin ${email} created. Remove SUPER_ADMIN_PASSWORD from .env now.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
