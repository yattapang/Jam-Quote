import { z } from "zod";

/**
 * The one password-strength rule, shared by every route that SETS a password
 * (register, reset-password, change-password). Kept in one place so the three
 * can't drift — a weaker rule on any single one of them is the effective rule
 * for the whole account.
 */
const newPasswordSchema = z.string().min(8);

export const registerSchema = z.object({
  email: z.string().email(),
  password: newPasswordSchema,
  fullName: z.string().min(1).optional(),
  businessName: z.string().min(1),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: newPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  // The strength rule deliberately does NOT apply here: this field is checked
  // against the stored hash, not stored, so enforcing today's minimum would
  // lock out anyone whose existing password predates it. Same min(1) as login.
  currentPassword: z.string().min(1),
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
