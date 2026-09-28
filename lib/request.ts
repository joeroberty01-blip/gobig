import "server-only";
import { headers } from "next/headers";
import { clientIpFrom } from "@/lib/clientIp";

/** Client address for rate limiting (see lib/clientIp.ts). Never used for authorization. */
export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
