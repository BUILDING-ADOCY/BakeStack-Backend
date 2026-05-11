import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateRoleAssignmentDto } from './dto/create-role-assignment.dto';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateRoleDto) {
    if (dto.tenantId && dto.tenantId !== tenantId) {
      throw new DomainException(
        'TENANT_ACCESS_DENIED',
        'Tenant access denied',
        403,
      );
    }

    return this.prisma.role.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        policyJson: dto.policyJson as Prisma.InputJsonValue,
      },
    });
  }

  async assign(tenantId: string, dto: CreateRoleAssignmentDto) {
    if (dto.tenantId && dto.tenantId !== tenantId) {
      throw new DomainException(
        'TENANT_ACCESS_DENIED',
        'Tenant access denied',
        403,
      );
    }

    const [user, role, location] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          tenantId,
          id: dto.userId,
        },
      }),
      this.prisma.role.findFirst({
        where: {
          tenantId,
          id: dto.roleId,
        },
      }),
      dto.locationId
        ? this.prisma.location.findFirst({
            where: {
              tenantId,
              id: dto.locationId,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!user || !role || (dto.locationId && !location)) {
      throw new DomainException(
        'TENANT_ACCESS_DENIED',
        'Role assignment references data outside the current tenant.',
        403,
      );
    }

    return this.prisma.userRoleAssignment.create({
      data: {
        tenantId,
        userId: dto.userId,
        roleId: dto.roleId,
        locationId: dto.locationId,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
    });
  }

  findAll(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
