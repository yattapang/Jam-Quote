import { describe, expect, it, vi } from "vitest";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

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
    const svc = new AuthService(prisma as any, jwt as any);

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
    const svc = new AuthService(prisma as any, makeJwt() as any);

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
    const svc = new AuthService(prisma as any, jwt as any);

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
    const svc = new AuthService(prisma as any, makeJwt() as any);

    await expect(svc.login({ email: "nobody@nowhere.jm", password: "x" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("throws Unauthorized for the wrong password", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
    };
    const svc = new AuthService(prisma as any, makeJwt() as any);

    await expect(
      svc.login({ email: "owner@blackwood.jm", password: "wrong-password" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
