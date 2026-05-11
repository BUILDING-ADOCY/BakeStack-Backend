import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get()
  async findAll(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.usersService.findAll(scope.tenant.id),
      message: 'Users retrieved successfully',
    };
  }

  @Post()
  async create(@Req() request: Request, @Body() dto: CreateUserDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.usersService.create(scope.tenant.id, dto),
      message: 'User created successfully',
    };
  }
}
