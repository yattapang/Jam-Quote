import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AuthService, type AuthResult, type SafeBusiness, type SafeUser } from "./auth.service.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "./auth.dto.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Stricter than the global default (120/60s) to blunt credential-stuffing
  // and registration-spam attempts against these unauthenticated endpoints.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("register")
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ): Promise<AuthResult> {
    return this.auth.register(body);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput): Promise<AuthResult> {
    return this.auth.login(body);
  }

  // Same strict limit as login/register — unauthenticated and abuse-prone
  // (token-guessing / email-bombing).
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("forgot-password")
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<{ ok: true }> {
    return this.auth.forgotPassword(body);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("reset-password")
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<{ ok: true }> {
    return this.auth.resetPassword(body);
  }

  // JwtAuthGuard, not TenantAuthGuard: that guard 403s any user with a null
  // businessId, and admins are deliberately issued exactly that (see
  // issueToken), so a tenant guard here would leave staff accounts with no way
  // to change their own password. "Signed in" is the correct bar — this route
  // touches only the caller's own row, never tenant-scoped data. Same guard as
  // GET /auth/me below.
  @UseGuards(JwtAuthGuard)
  // Same strict limit as the other auth routes — an authenticated attacker
  // could otherwise brute-force the current password through this endpoint.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("change-password")
  changePassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<{ ok: true }> {
    // The user id comes from the verified token only. The body carries
    // passwords and nothing else — there is no id to spoof.
    return this.auth.changePassword(req.user!.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: Request): Promise<{ user: SafeUser; business: SafeBusiness | null }> {
    // JwtAuthGuard has already verified the token and set req.user.
    return this.auth.me(req.user!.sub);
  }
}
