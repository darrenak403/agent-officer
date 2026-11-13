import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './module';

async function bootstrap() {
  if (!process.env.OFFICE_INGEST_TOKEN) throw new Error('OFFICE_INGEST_TOKEN is required');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.enableCors({ origin: ['http://127.0.0.1:3000', 'http://localhost:3000'], methods: ['GET'] });
  app.useBodyParser('json', { limit: '32kb' });
  await app.listen(Number(process.env.PORT ?? 4100), process.env.HOST ?? '127.0.0.1');
}

void bootstrap();
