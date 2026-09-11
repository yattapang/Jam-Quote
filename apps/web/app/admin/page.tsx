import AdminConsole from "./AdminConsole";
import { getAdminData } from "@/lib/api-server";
import { getSession } from "@/lib/session";
import { API_BASE_URL } from "@/lib/api-client";
import { apiEnvironment } from "@/lib/api-environment";

export const metadata = { title: "JamQuote Staff Console" };

// Internal staff-only console (gated to ADMIN by app/admin/layout.tsx). Reads
// the platform /admin endpoints; the profile chip shows the real signed-in
// admin (not the old design-mock identity).
export default async function AdminPage() {
  const [data, session] = await Promise.all([getAdminData(), getSession()]);
  const admin = {
    name: session?.user.fullName?.trim() || session?.user.email || "Admin",
    email: session?.user.email ?? "",
  };
  // Resolved here, on the server, from the SAME constant every fetch uses — the
  // console's environment badge and its data cannot then disagree about which
  // deployment this is. `API_BASE_URL` is not a NEXT_PUBLIC_ variable, so the
  // client bundle could never have read it.
  return <AdminConsole data={data} admin={admin} apiEnv={apiEnvironment(API_BASE_URL)} />;
}
