import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  listWebhookInbox(tenantId: string) {
    return this.prisma.webhookInbox.findMany({
      where: { tenantId },
      orderBy: { receivedAt: 'desc' },
    });
  }
}
