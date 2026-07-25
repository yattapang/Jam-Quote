import AdminConsole from "./AdminConsole";
import { getAdminData } from "@/lib/api-server";
import { getSession } from "@/lib/session";

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
  return <AdminConsole data={data} admin={admin} />;
}
