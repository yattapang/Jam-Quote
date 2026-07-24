import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { AuthContextMiddleware } from "./auth-context.middleware.js";

// Dev-only fallback so `npm run dev` works out of the box without a .env
// entry. Never used when NODE_ENV=production — see resolveJwtSecret below.
const DEV_JWT_SECRET_FALLBACK = "jamquote-dev-secret-do-not-use-in-production";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set. Refusing to start in production without it — set JWT_SECRET in the environment (e.g. Render config).",
    );
  }
  return DEV_JWT_SECRET_FALLBACK;
}

@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: "30d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AuthContextMiddleware],
  // JwtModule is exported so AppModule's AuthContextMiddleware wiring (and any
  // future protected module) can reuse the same configured JwtService;
  // AuthContextMiddleware itself is exported so AppModule can apply it
  // globally via configure(consumer) without re-instantiating it.
  exports: [AuthService, JwtModule, AuthContextMiddleware],
})
export class AuthModule {}
