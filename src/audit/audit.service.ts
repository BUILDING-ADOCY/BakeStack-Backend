import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

type AuditExecutor = Prisma.TransactionClient | PrismaClient | PrismaService;

export interface AuditLogInput {
  tenantId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeJson?: Prisma.InputJsonValue;
  afterJson?: Prisma.InputJsonValue;
  correlationId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(input: AuditLogInput, executor: AuditExecutor = this.prisma) {
    return executor.auditLog.create({
      data: input,
    });
  }

  findAll(tenantId: string, query: QueryAuditLogsDto) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        actorId: query.actorId,
        entityType: query.entityType,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
