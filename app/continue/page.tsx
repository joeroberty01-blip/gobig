import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { roleHome } from "@/lib/roles";

/** Post-login hop: sends each role to its own home. */
export default async function ContinuePage() {
  const user = await getCurrentUser();
  redirect(user ? roleHome(user.role) : "/login");
}
