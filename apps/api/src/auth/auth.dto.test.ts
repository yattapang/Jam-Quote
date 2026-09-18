import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH } from "@jamquote/core";
import { changePasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "./auth.dto.js";

/**
 * Every password-setting route must cap a new password at the same length
 * login later checks against — otherwise a contractor can set a password
 * that saves successfully and then can never log in again, because login's
 * own `max` rejects it before it ever reaches bcrypt.
 */
describe("password length ceiling agrees across auth DTOs", () => {
  const tooLong = "a".repeat(PASSWORD_MAX_LENGTH + 1);
  const atLimit = "a".repeat(PASSWORD_MAX_LENGTH);

  it("register rejects a password over the shared max", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: tooLong,
      businessName: "Acme",
    });
    expect(result.success).toBe(false);
  });

  it("register accepts a password exactly at the shared max", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: atLimit,
      businessName: "Acme",
    });
    expect(result.success).toBe(true);
  });

  it("reset-password rejects a password over the shared max", () => {
    const result = resetPasswordSchema.safeParse({ token: "t", newPassword: tooLong });
    expect(result.success).toBe(false);
  });

  it("change-password rejects a new password over the shared max", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "whatever",
      newPassword: tooLong,
    });
    expect(result.success).toBe(false);
  });

  it("a password accepted by every set-password route also fits login's own max", () => {
    // The real invariant: whatever the set side will accept, the check side
    // must never turn around and refuse.
    expect(registerSchema.shape.password.safeParse(atLimit).success).toBe(true);
    expect(loginSchema.shape.password.safeParse(atLimit).success).toBe(true);
  });
});
