import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface PrismaScope {
  tenantId: string;
  actorId?: string | null;
  allowedLocationIds?: string[];
  tenantWideAccess?: boolean;
}

type ScopedOperation<T> = (transaction: Prisma.TransactionClient) => Promise<T>;

@Injectable()
export class ScopedPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  withScope<T>(scope: PrismaScope, operation: ScopedOperation<T>): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await this.setScope(transaction, scope);
      return operation(transaction);
    });
  }

  private async setScope(
    transaction: Pick<PrismaClient, '$executeRaw'>,
    scope: PrismaScope,
  ): Promise<void> {
    const allowedLocationIds = scope.allowedLocationIds?.join(',') ?? '';
    const tenantWideAccess = scope.tenantWideAccess ? 'true' : 'false';

    await transaction.$executeRaw`
      SELECT
        set_config('app.tenant_id', ${scope.tenantId}, true),
        set_config('app.actor_id', ${scope.actorId ?? ''}, true),
        set_config('app.allowed_location_ids', ${allowedLocationIds}, true),
        set_config('app.tenant_wide_access', ${tenantWideAccess}, true)
    `;
  }
}
