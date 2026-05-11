import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateUserDto) {
    if (dto.tenantId && dto.tenantId !== tenantId) {
      throw new DomainException(
        'TENANT_ACCESS_DENIED',
        'Tenant access denied',
        403,
      );
    }

    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        displayName: dto.displayName,
        phone: dto.phone,
        status: dto.status ?? UserStatus.INVITED,
      },
    });
  }

  findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      include: {
        roleAssignments: {
          include: {
            role: true,
            location: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
