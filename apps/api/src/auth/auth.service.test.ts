import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AuthService } from "./auth.service.js";

const sendMock = vi.fn(async (_args: { to: string; html: string }) => ({
  data: { id: "email-1" },
  error: null,
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (password: string) => `hashed:${password}`),
    compare: vi.fn(async (password: string, hash: string) => hash === `hashed:${password}`),
  },
}));

function makeJwt() {
  return { sign: vi.fn().mockReturnValue("signed.jwt.token") };
}

// RulePackService dependency — registration reads the effective default GCT
// rate from it. Baseline JM rate is 15.
function makeRulePack() {
  return { defaultTaxRatePct: vi.fn().mockResolvedValue(15) };
}

const business = { id: "biz-1", name: "Blackwood Construction", countryCode: "JM", currency: "JMD" };
const user = {
  id: "u1",
  businessId: "biz-1",
  role: "OWNER",
  email: "owner@blackwood.jm",
  fullName: "Owen Blackwood",
  phone: null,
  passwordHash: "hashed:Blackwood123!",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("AuthService.register", () => {
  it("hashes the password, creates a business + OWNER user, and returns a token with no passwordHash", async () => {
    const tx = {
      business: { create: vi.fn().mockResolvedValue(business) },
      user: { create: vi.fn().mockResolvedValue(user) },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const jwt = makeJwt();
    const svc = new AuthService(prisma as any, jwt as any, makeRulePack() as any);

    const result = await svc.register({
      email: "Owner@Blackwood.JM",
      password: "Blackwood123!",
      fullName: "Owen Blackwood",
      businessName: "Blackwood Construction",
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "owner@blackwood.jm" } });
    expect(tx.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Blackwood Construction",
          countryCode: "JM",
          currency: "JMD",
          defaultGctRate: 15, // seeded from the effective rule-pack, not hardcoded
        }),
      }),
    );
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "owner@blackwood.jm",
          passwordHash: "hashed:Blackwood123!",
          role: "OWNER",
          businessId: "biz-1",
        }),
      }),
    );
    expect(result.token).toBe("signed.jwt.token");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.business).toEqual({
      id: "biz-1",
      name: "Blackwood Construction",
      countryCode: "JM",
      currency: "JMD",
    });
  });

  it("throws Conflict when a user with that email already exists", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      $transaction: vi.fn(),
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(
      svc.register({
        email: "owner@blackwood.jm",
        password: "Blackwood123!",
        businessName: "Blackwood Construction",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("AuthService.login", () => {
  it("returns a token + safe user on success", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      business: { findUnique: vi.fn().mockResolvedValue(business) },
    };
    const jwt = makeJwt();
    const svc = new AuthService(prisma as any, jwt as any, makeRulePack() as any);

    const result = await svc.login({ email: "owner@blackwood.jm", password: "Blackwood123!" });

    expect(result.token).toBe("signed.jwt.token");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: "u1", businessId: "biz-1", role: "OWNER" },
      expect.objectContaining({ expiresIn: "30d" }),
    );
  });

  it("throws Unauthorized for an unknown email", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(svc.login({ email: "nobody@nowhere.jm", password: "x" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("throws Unauthorized for the wrong password", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(
      svc.login({ email: "owner@blackwood.jm", password: "wrong-password" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws Unauthorized when the user's business has been suspended (deletedAt set)", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      business: {
        findUnique: vi.fn().mockResolvedValue({ ...business, deletedAt: new Date() }),
      },
    };
    const jwt = makeJwt();
    const svc = new AuthService(prisma as any, jwt as any, makeRulePack() as any);

    await expect(
      svc.login({ email: "owner@blackwood.jm", password: "Blackwood123!" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});

describe("AuthService.forgotPassword", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    sendMock.mockClear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("creates a hashed reset token and sends an email when the user exists", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.WEB_ORIGIN = "https://app.jamquote.jm,https://other.example";

    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      passwordResetToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    const result = await svc.forgotPassword({ email: "Owner@Blackwood.JM" });

    expect(result).toEqual({ ok: true });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "owner@blackwood.jm" } });
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", usedAt: null } }),
    );
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1" }),
      }),
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sentArgs = sendMock.mock.calls[0]![0];
    expect(sentArgs.to).toBe("owner@blackwood.jm");
    expect(sentArgs.html).toContain("https://app.jamquote.jm/reset-password?token=");

    // The token embedded in the email must hash to the value persisted to the DB.
    const createdData = prisma.passwordResetToken.create.mock.calls[0]![0].data;
    const match = /token=([0-9a-f]+)/.exec(sentArgs.html);
    const rawToken = match?.[1];
    expect(rawToken).toBeTruthy();
    expect(createHash("sha256").update(rawToken!).digest("hex")).toBe(createdData.tokenHash);
  });

  it("returns ok:true without querying tokens when the email is unknown (no user enumeration)", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      passwordResetToken: { updateMany: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(),
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    const result = await svc.forgotPassword({ email: "nobody@nowhere.jm" });

    expect(result).toEqual({ ok: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips sending and still returns ok:true when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;

    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      passwordResetToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    const result = await svc.forgotPassword({ email: "owner@blackwood.jm" });

    expect(result).toEqual({ ok: true });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("AuthService.changePassword", () => {
  function makePrisma(found: unknown = user) {
    return {
      user: { findUnique: vi.fn().mockResolvedValue(found), update: vi.fn().mockResolvedValue({}) },
      passwordResetToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
  }

  it("rejects a wrong current password and writes nothing", async () => {
    const prisma = makePrisma();
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(
      svc.changePassword("u1", { currentPassword: "not-my-password", newPassword: "NewPass123!" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stores a NEW hash when the current password is correct", async () => {
    const prisma = makePrisma();
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    const result = await svc.changePassword("u1", {
      currentPassword: "Blackwood123!",
      newPassword: "NewPass123!",
    });

    expect(result).toEqual({ ok: true });
    const updateArgs = prisma.user.update.mock.calls[0]![0];
    expect(updateArgs.data.passwordHash).toBe("hashed:NewPass123!");
    // The point of the endpoint: the stored hash must actually have changed.
    expect(updateArgs.data.passwordHash).not.toBe(user.passwordHash);
    // A reset link already sitting in the user's inbox must not be able to
    // overwrite the password they just chose.
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", usedAt: null } }),
    );
  });

  it("takes the user id from the caller (the verified token), not the body", async () => {
    const prisma = makePrisma();
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    // A body carrying someone else's id must have no effect: the id is a
    // separate argument the controller fills from req.user.sub.
    await svc.changePassword("u1", {
      currentPassword: "Blackwood123!",
      newPassword: "NewPass123!",
      ...({ userId: "victim-user", sub: "victim-user" } as Record<string, string>),
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(prisma.user.update.mock.calls[0]![0].where).toEqual({ id: "u1" });
  });

  it("rejects a new password identical to the current one", async () => {
    const prisma = makePrisma();
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(
      svc.changePassword("u1", {
        currentPassword: "Blackwood123!",
        newPassword: "Blackwood123!",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when the token's user no longer exists", async () => {
    const prisma = makePrisma(null);
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(
      svc.changePassword("deleted-user", {
        currentPassword: "Blackwood123!",
        newPassword: "NewPass123!",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("AuthService.resetPassword", () => {
  const rawToken = "a".repeat(64);
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  it("updates the password hash and marks the token used on success", async () => {
    const resetToken = {
      id: "rt1",
      userId: "u1",
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    };
    const prisma = {
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue(resetToken),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: { update: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    const result = await svc.resetPassword({ token: rawToken, newPassword: "NewPass123!" });

    expect(result).toEqual({ ok: true });
    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash } });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ passwordHash: "hashed:NewPass123!" }),
      }),
    );
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rt1" }, data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
    );
  });

  it("rejects an unknown token", async () => {
    const prisma = {
      passwordResetToken: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(
      svc.resetPassword({ token: rawToken, newPassword: "NewPass123!" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an already-used token", async () => {
    const prisma = {
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rt1",
          userId: "u1",
          tokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: new Date(),
        }),
      },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(
      svc.resetPassword({ token: rawToken, newPassword: "NewPass123!" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an expired token", async () => {
    const prisma = {
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rt1",
          userId: "u1",
          tokenHash,
          expiresAt: new Date(Date.now() - 60_000),
          usedAt: null,
        }),
      },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any, makeRulePack() as any);

    await expect(
      svc.resetPassword({ token: rawToken, newPassword: "NewPass123!" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
