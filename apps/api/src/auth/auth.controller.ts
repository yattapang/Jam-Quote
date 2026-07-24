import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AuthService, type AuthResult, type SafeBusiness, type SafeUser } from "./auth.service.js";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "./auth.dto.js";
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

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: Request): Promise<{ user: SafeUser; business: SafeBusiness | null }> {
    // JwtAuthGuard has already verified the token and set req.user.
    return this.auth.me(req.user!.sub);
  }
}
