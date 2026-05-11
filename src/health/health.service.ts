import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async check() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      data: {
        status: 'ok',
        service: 'BakeStack Backend',
      },
      message: 'Health check completed successfully',
    };
  }

  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;

    const securityBaseUrl = this.configService.get<string>('SECURITY_BASE_URL');
    let securityStatus = 'not_configured';

    if (securityBaseUrl) {
      try {
        const response = await fetch(new URL('/health', securityBaseUrl), {
          signal: AbortSignal.timeout(3_000),
        });

        if (!response.ok) {
          throw new Error(`Received ${response.status}`);
        }

        securityStatus = 'ok';
      } catch (error) {
        throw new DomainException(
          'DEPENDENCY_UNAVAILABLE',
          `Security service readiness check failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
          503,
        );
      }
    }

    return {
      data: {
        status: 'ready',
        service: 'BakeStack Backend',
        checks: {
          database: 'ok',
          security: securityStatus,
        },
      },
      message: 'Readiness check completed successfully',
    };
  }
}
