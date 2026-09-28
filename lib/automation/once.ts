import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * For sweep rules that act on many items: true the first time (rule, key) is claimed, false ever
 * after (until the record is pruned, 30 days). Uses the run log's unique key, so two sweeps can't
 * both act on the same item.
 */
export async function claimOnce(ruleId: string, key: string): Promise<boolean> {
  try {
    await prisma.automationRun.create({ data: { ruleId, subjectKey: `item:${key}`, trigger: "item", status: "DONE" } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}
