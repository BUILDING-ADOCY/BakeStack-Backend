import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  findExisting(tenantId: string, route: string, method: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({
      where: {
        tenantId_key_route_method: {
          tenantId,
          key,
          route,
          method,
        },
      },
    });
  }
}
