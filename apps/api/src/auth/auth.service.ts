import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { Resend } from "resend";
import { EntityType, UserRole, type Business, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from "./auth.dto.js";

const BCRYPT_COST = 10;
const TOKEN_EXPIRY = "30d";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function resolveWebBase(): string {
  const origins = process.env.WEB_ORIGIN;
  const first = origins?.split(",")[0]?.trim();
  return first || "http://localhost:3000";
}

/** JWT payload shape signed by issueToken and read back by JwtAuthGuard / auth-context.middleware. */
export interface AuthTokenPayload {
  sub: string;
  businessId: string | null;
  role: User["role"];
}

// Never let a passwordHash leak into an API response.
export type SafeUser = Omit<User, "passwordHash">;

export interface SafeBusiness {
  id: string;
  name: string;
  countryCode: string;
  currency: string;
}

export interface AuthResult {
  token: string;
  user: SafeUser;
  business: SafeBusiness | null;
}

function toSafeUser(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function toSafeBusiness(business: Business): SafeBusiness {
  return {
    id: business.id,
    name: business.name,
    countryCode: business.countryCode,
    currency: business.currency,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with that email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    const { user, business } = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: input.businessName,
          countryCode: "JM",
          currency: "JMD",
          entityType: EntityType.SOLE_TRADER,
          defaultGctRate: 15,
          quotePrefix: "QT-",
          nextQuoteSeq: 1,
        },
      });
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: input.fullName,
          businessId: business.id,
          role: UserRole.OWNER,
        },
      });
      return { user, business };
    });

    const token = this.issueToken(user);
    return { token, user: toSafeUser(user), business: toSafeBusiness(business) };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const business = user.businessId
      ? await this.prisma.business.findUnique({ where: { id: user.businessId } })
      : null;

    const token = this.issueToken(user);
    return { token, user: toSafeUser(user), business: business ? toSafeBusiness(business) : null };
  }

  async me(userId: string): Promise<{ user: SafeUser; business: SafeBusiness | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    const business = user.businessId
      ? await this.prisma.business.findUnique({ where: { id: user.businessId } })
      : null;
    return { user: toSafeUser(user), business: business ? toSafeBusiness(business) : null };
  }

  /**
   * Always resolves with a neutral { ok: true } whether or not the email
   * belongs to an account — never leak account existence to the caller.
   */
  async forgotPassword(input: ForgotPasswordInput): Promise<{ ok: true }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await this.prisma.$transaction([
        // Invalidate any prior unused tokens for this user before issuing a new one.
        this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetToken.create({
          data: { userId: user.id, tokenHash, expiresAt },
        }),
      ]);

      await this.sendResetEmail(user, rawToken);
    }

    return { ok: true };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ ok: true }> {
    const tokenHash = hashResetToken(input.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken) {
      throw new BadRequestException("This reset link is invalid.");
    }
    if (resetToken.usedAt) {
      throw new BadRequestException("This reset link has already been used.");
    }
    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException("This reset link has expired.");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      }),
      // Invalidate any other unused tokens for this user.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null, id: { not: resetToken.id } },
        data: { usedAt: now },
      }),
    ]);

    return { ok: true };
  }

  private async sendResetEmail(user: User, rawToken: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY is not set — skipping password reset email for user ${user.id}.`,
      );
      return;
    }

    const webBase = resolveWebBase();
    const resetLink = `${webBase}/reset-password?token=${rawToken}`;
    const from =
      process.env.PASSWORD_RESET_FROM_EMAIL ??
      process.env.EMAIL_FROM ??
      "JamQuote <onboarding@resend.dev>";

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: user.email!,
      subject: "Reset your JamQuote password",
      html: `
        <p>Hi ${user.fullName || "there"},</p>
        <p>We received a request to reset your JamQuote password. Click the link below to choose a new one:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      this.logger.warn(`Failed to send password reset email for user ${user.id}: ${error.message}`);
    }
  }

  issueToken(user: Pick<User, "id" | "businessId" | "role">): string {
    const payload: AuthTokenPayload = {
      sub: user.id,
      businessId: user.businessId,
      role: user.role,
    };
    return this.jwt.sign(payload, { expiresIn: TOKEN_EXPIRY });
  }
}
