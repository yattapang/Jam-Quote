import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
