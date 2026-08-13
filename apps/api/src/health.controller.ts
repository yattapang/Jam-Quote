import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service.js";
import { isEmailConfigured } from "./common/email-config.util.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string; db: boolean; email: boolean; ts: string }> {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    // `email` is config presence, not a live send: password reset is the one
    // flow whose failure is invisible to the user by design, so an operator
    // needs a way to check it that doesn't involve triggering a real reset.
    return { status: "ok", db, email: isEmailConfigured(), ts: new Date().toISOString() };
  }
}
