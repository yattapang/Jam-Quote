import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleInit,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { Resend } from "resend";
import { EntityType, UserRole, type Business, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { RulePackService } from "../rulepack/rulepack.service.js";
import { isEmailConfigured } from "../common/email-config.util.js";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.dto.js";

const BCRYPT_COST = 10;
const TOKEN_EXPIRY = "30d";
/**
 * View-as-tenant tokens expire in 30 minutes, not the 30 days an ordinary
 * session gets. This token lets one person read another company's books, so
 * its lifetime should be about as long as the support task that justified it.
 * There is no revocation list; the short expiry IS the revocation.
 */
const IMPERSONATION_TOKEN_EXPIRY_SECONDS = 30 * 60;
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
  /**
   * Set ONLY on an admin's short-lived "view as tenant" token, naming the
   * tenant being viewed. `sub` stays the ADMIN's user id — the admin does not
   * become the tenant's user; they are themselves, looking at someone else's
   * data, and the audit trail has to keep saying so.
   *
   * Its presence changes what the token may do, in three places that must
   * agree:
   *   - TenantAuthGuard accepts it, scopes the request to this business, and
   *     allows read-only methods only.
   *   - AdminGuard REJECTS it, so a view-as token can never reach the admin
   *     API. Without that it would sail straight through, because it does
   *     belong to a genuine, currently-serving admin.
   *   - JwtAuthGuard REJECTS it, so it cannot act on the admin's own account
   *     (password changes and the like).
   */
  impersonatedBusinessId?: string;
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
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly rulePack: RulePackService,
  ) {}

  onModuleInit(): void {
    // Surfaced at boot so a misconfigured deploy shows up in the Render log
    // immediately, rather than only when some contractor happens to try a
    // password reset and silently never receives it (see sendResetEmail).
    // Unlike auth.module.ts's JWT_SECRET check and wipay.service.ts's live-key
    // check, this deliberately does NOT refuse to boot: undeliverable email is
    // degraded functionality, not a security hole, and taking the whole API
    // down over it would be worse than the bug it reports.
    if (process.env.NODE_ENV === "production" && !isEmailConfigured()) {
      this.logger.error(
        "RESEND_API_KEY is not set — password reset emails will NOT be delivered. Users who click \"Forgot password?\" will see a success message and receive nothing. Set RESEND_API_KEY in the environment (e.g. Render config).",
      );
    }
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with that email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    // Seed the new tenant's default consumption-tax rate from the effective
    // rule-pack (baseline + any admin override) rather than a hardcoded 15, so
    // a rate change in /admin/rulepack applies to businesses created afterward.
    const defaultGctRate = await this.rulePack.defaultTaxRatePct("JM");

    const { user, business } = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: input.businessName,
          countryCode: "JM",
          currency: "JMD",
          entityType: EntityType.SOLE_TRADER,
          defaultGctRate,
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

    // A suspended (soft-deleted) business's users can no longer sign in —
    // this is what makes the admin "suspend tenant" action actually take
    // effect for the affected users immediately, not just hide the tenant
    // from admin listings.
    if (business?.deletedAt) {
      throw new UnauthorizedException("This account has been suspended.");
    }

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

  /**
   * Changes the password of the signed-in user. `userId` MUST come from the
   * verified token (see AuthController) — never from the request body, which
   * would let any authenticated user rewrite anyone else's password.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("User not found");
    }

    // Re-verifying the current password is the entire point of this endpoint.
    // Without it, a stolen token or an unattended signed-in phone converts a
    // temporary session into a permanent account takeover.
    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) {
      // 400, not 401: the caller's token IS valid. The web client treats any
      // 401 as an expired session and bounces to /login (see api-client.ts's
      // request()), which would throw the user out of the app over a typo.
      throw new BadRequestException("Current password is incorrect");
    }

    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException("Your new password must be different from your current one.");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // Any reset link already in the user's inbox would otherwise still be
      // able to overwrite the password they just deliberately chose — same
      // invalidation resetPassword performs for the same reason.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  private async sendResetEmail(user: User, rawToken: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      const message = `RESEND_API_KEY is not set — skipping password reset email for user ${user.id}.`;
      // In production this is a silent total failure of account recovery: the
      // caller gets the same neutral { ok: true } either way (deliberately —
      // see forgotPassword), so this log line is the only signal that exists.
      // Error level so it stands out from routine warn noise in the deploy log.
      // In dev it stays a warning: no key is the normal local state.
      if (process.env.NODE_ENV === "production") {
        this.logger.error(message);
      } else {
        this.logger.warn(message);
      }
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

  /**
   * Mint a short-lived, read-only token letting `admin` view `businessId`'s
   * data. Callers must already have proved the admin's authorization —
   * AdminGuard plus @RequireCapability(MANAGE_TENANTS) — and must record the
   * audit entry; this method only signs.
   *
   * `businessId` on the payload stays null. That field means "the business
   * this user belongs to", and the admin still belongs to no business;
   * writing the target there would blur the very distinction the guards rely
   * on to tell a real tenant session from a borrowed view.
   */
  issueImpersonationToken(
    admin: Pick<User, "id" | "role">,
    businessId: string,
  ): { token: string; expiresAt: string } {
    const payload: AuthTokenPayload = {
      sub: admin.id,
      businessId: null,
      role: admin.role,
      impersonatedBusinessId: businessId,
    };
    return {
      token: this.jwt.sign(payload, { expiresIn: IMPERSONATION_TOKEN_EXPIRY_SECONDS }),
      expiresAt: new Date(Date.now() + IMPERSONATION_TOKEN_EXPIRY_SECONDS * 1000).toISOString(),
    };
  }
}
