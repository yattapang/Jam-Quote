import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
