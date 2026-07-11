import AdminConsole from "./AdminConsole";

export const metadata = { title: "JamQuote Staff Console" };

// Internal staff-only console (not linked from the contractor app). Full-screen
// single-page app; its own theme, independent of the contractor UI.
export default function AdminPage() {
  return <AdminConsole />;
}
