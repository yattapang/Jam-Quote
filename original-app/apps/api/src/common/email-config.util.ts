/**
 * Whether outbound transactional email (currently only the password-reset
 * mail) can actually be delivered.
 *
 * Read in three places that must agree: the boot-time check in AuthService,
 * the per-send check in sendResetEmail, and /health — an operator should be
 * able to answer "is email working?" from outside the box without reading
 * logs, because the user-facing forgot-password flow deliberately looks
 * identical whether or not the mail went out.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
