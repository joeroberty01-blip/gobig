import { redirect } from "next/navigation";
import { requirePageAccess } from "@/lib/session";

// Short address for Settings: each role's settings live inside its own area.
export default async function SettingsRedirect() {
  const user = await requirePageAccess("account:view", "/settings");
  redirect(user.role === "PROVIDER" ? "/provider/account" : user.role === "CUSTOMER" ? "/account" : "/admin/account");
}
