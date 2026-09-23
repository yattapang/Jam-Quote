import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  // bodyParser: false so the limits below apply — Nest's built-in parser caps
  // JSON at 100kb, which a base64 logo upload (#27) exceeds.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // 4mb covers a 2MB logo after base64 inflation (~4/3). normalizeLogo
  // enforces the real 2MB cap on the DECODED bytes; this only bounds the
  // request body.
  app.use(json({ limit: "4mb" }));
  // Required, not incidental: the WiPay webhook posts form-encoded and reads
  // req.body (payments.controller). Dropping this would leave that body empty
  // and fail payment callbacks silently.
  app.use(urlencoded({ extended: true, limit: "1mb" }));
  // The API sits behind Render's load balancer, which terminates TLS and
  // proxies every request. Without this, express (and therefore the
  // throttler guard, which keys on req.ip) sees the proxy's IP for every
  // client, collapsing all users into a single rate-limit bucket. `1` trusts
  // exactly one hop (Render's LB) and reads the real client IP from
  // X-Forwarded-For.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  // Security headers for a JSON API (no HTML is served, so helmet's
  // defaults — including CSP — are safe here and don't need loosening).
  app.use(helmet());
  app.setGlobalPrefix("api");
  // WEB_ORIGIN is a comma-separated allow-list (e.g. the deployed Vercel URL).
  // Unset in dev -> allow all origins; set in production to restrict.
  const webOrigin = process.env.WEB_ORIGIN;
  const origins = webOrigin
    ? webOrigin.split(",").map((origin) => origin.trim()).filter(Boolean)
    : true;
  app.enableCors({ origin: origins });
  // Validation is done per-route with Zod (ZodValidationPipe); no global
  // class-validator ValidationPipe needed.
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`JamQuote API listening on http://localhost:${port}/api`);
}

void bootstrap();
