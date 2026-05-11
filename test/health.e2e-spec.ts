import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('Health endpoint (e2e)', () => {
  let app: INestApplication;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
    }) as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'SECURITY_BASE_URL' ? 'http://security:4001' : undefined,
            ),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    global.fetch = originalFetch;
  });

  it('/health returns the standard success response', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ok',
        service: 'BakeStack Backend',
      },
      message: 'Health check completed successfully',
    });
  });

  it('/health/ready returns the standard readiness response', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ready',
        service: 'BakeStack Backend',
        checks: {
          database: 'ok',
          security: 'ok',
        },
      },
      message: 'Readiness check completed successfully',
    });
  });
});
