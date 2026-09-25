import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations go through the direct (non-pooled) Neon host: schema changes and advisory locks
// are unreliable through PgBouncer. The app itself connects through DATABASE_URL (pooled).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
