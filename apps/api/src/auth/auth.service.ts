import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { EntityType, UserRole, type Business, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { LoginInput, RegisterInput } from "./auth.dto.js";

const BCRYPT_COST = 10;
const TOKEN_EXPIRY = "30d";

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

  issueToken(user: Pick<User, "id" | "businessId" | "role">): string {
    const payload: AuthTokenPayload = {
      sub: user.id,
      businessId: user.businessId,
      role: user.role,
    };
    return this.jwt.sign(payload, { expiresIn: TOKEN_EXPIRY });
  }
}
