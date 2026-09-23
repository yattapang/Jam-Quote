/**
 * Who to email at a tenant business.
 *
 * The order matters and has already been got wrong once: an earlier version
 * queried `role: "OWNER"` only, and a tenant whose sole account holder is an
 * ADMIN had nobody to reach — the reminder ran, found no recipient, and said
 * nothing. Hence the final fallback to any addressable user.
 *
 * Shared because three separate features now need it (subscription notices,
 * the overdue digest, and quote-decision notifications) and a rule copied
 * three times is a rule that will eventually disagree with itself.
 */
export interface AddressableBusiness {
  billingContactEmail?: string | null;
  users: { email: string | null; role: string }[];
}

export function addressableEmail(business: AddressableBusiness): string | undefined {
  // The subscriber's own stated choice wins: they may want billing going
  // somewhere other than the person who happens to hold the account.
  const billing = business.billingContactEmail?.trim();
  if (billing) return billing;

  const owner = business.users.find((u) => u.role === "OWNER" && u.email?.trim());
  if (owner?.email) return owner.email.trim();

  return business.users.find((u) => u.email?.trim())?.email?.trim();
}
