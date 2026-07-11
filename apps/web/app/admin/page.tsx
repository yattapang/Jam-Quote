import AdminConsole from "./AdminConsole";
import { getAdminData } from "@/lib/api-client";

export const metadata = { title: "JamQuote Staff Console" };

// Internal staff-only console (not linked from the contractor app). Reads the
// same Neon-backed API as the contractor app via the platform /admin endpoints;
// falls back to the design sample when the API is unreachable.
export default async function AdminPage() {
  const data = await getAdminData();
  return <AdminConsole data={data} />;
}
