import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata = { title: "JamQuote Staff Console · internal" };

// The staff console renders its own full-screen chrome; no shared layout.
//
// This is a UX gate, not the real security boundary — the actual protection
// is AdminGuard on the API (apps/api/src/auth/admin.guard.ts), which every
// /api/admin/* route requires and re-checks the caller's role fresh from the
// DB. This redirect just keeps a signed-out or non-admin user from seeing the
// console shell at all.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }
  return <>{children}</>;
}
