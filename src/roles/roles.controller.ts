import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { CreateRoleAssignmentDto } from './dto/create-role-assignment.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get('roles')
  async findAll(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.rolesService.findAll(scope.tenant.id),
      message: 'Roles retrieved successfully',
    };
  }

  @Post('roles')
  async create(@Req() request: Request, @Body() dto: CreateRoleDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.rolesService.create(scope.tenant.id, dto),
      message: 'Role created successfully',
    };
  }

  @Post('role-assignments')
  async assign(@Req() request: Request, @Body() dto: CreateRoleAssignmentDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.rolesService.assign(scope.tenant.id, dto),
      message: 'Role assignment created successfully',
    };
  }
}
