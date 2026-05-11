import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaService } from './common/prisma/prisma.service';
import { buildValidationPipe } from './common/pipes/validation.pipe';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);
  const prisma = app.get(PrismaService);
  const port = Number(configService.get<string>('PORT', '3010'));
  const host = configService.get<string>('HOST', '0.0.0.0');
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:5176')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(buildValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();
  await prisma.enableShutdownHooks(app);

  await app.listen(port, host);
  logger.log(`BakeStack Backend listening on http://${host}:${port}`);
}

void bootstrap();
