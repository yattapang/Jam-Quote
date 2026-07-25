/**
 * Promote an existing user to the ADMIN role — grants access to the staff
 * console (/admin) and the platform admin API (/api/admin/*, incl. the pricing
 * editor and per-tenant plan toggle).
 *
 * Usage (loads apps/api/.env, same as prisma/seed.ts):
 *   ADMIN_EMAIL=you@example.com npm run -w @jamquote/api db:promote-admin
 *
 * The user must already exist — register the account in the app first, then
 * run this against that email. Safe/idempotent: no-op if already ADMIN.
 *
 * Takes effect immediately — AdminGuard and /auth/me both read the role fresh
 * from the DB, so there's no need to sign out and back in.
 */
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    // eslint-disable-next-line no-console
    console.log(
      "Set ADMIN_EMAIL to the email of the user to promote, e.g.\n" +
        "  ADMIN_EMAIL=you@example.com npm run -w @jamquote/api db:promote-admin",
    );
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // eslint-disable-next-line no-console
    console.log(`No user found with email "${email}". Register that account in the app first, then re-run.`);
    return;
  }
  if (user.role === UserRole.ADMIN) {
    // eslint-disable-next-line no-console
    console.log(`User "${email}" is already ADMIN — nothing to do.`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
  // eslint-disable-next-line no-console
  console.log(`Promoted "${email}" to ADMIN. You can now open /admin (the pricing editor + Set Pro/Free live there).`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
