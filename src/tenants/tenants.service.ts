import { Injectable } from '@nestjs/common';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(currentTenantId: string, dto: CreateTenantDto) {
    return this.update(currentTenantId, currentTenantId, dto);
  }

  findAll(tenantId: string) {
    return this.prisma.tenant.findMany({
      where: { id: tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(currentTenantId: string, id: string) {
    if (id !== currentTenantId) {
      throw new DomainException(
        'TENANT_ACCESS_DENIED',
        'Tenant access denied',
        403,
      );
    }

    return this.prisma.tenant.findFirst({
      where: { id: currentTenantId },
    });
  }

  async update(currentTenantId: string, id: string, dto: UpdateTenantDto) {
    if (id !== currentTenantId) {
      throw new DomainException(
        'TENANT_ACCESS_DENIED',
        'Tenant access denied',
        403,
      );
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: currentTenantId },
    });

    if (!tenant) {
      throw new DomainException('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    return this.prisma.tenant.update({
      where: { id },
      data: dto,
    });
  }
}
