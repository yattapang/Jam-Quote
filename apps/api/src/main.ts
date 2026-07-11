import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors(); // tighten origins before production
  // Validation is done per-route with Zod (ZodValidationPipe); no global
  // class-validator ValidationPipe needed.
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`JamQuote API listening on http://localhost:${port}/api`);
}

void bootstrap();
