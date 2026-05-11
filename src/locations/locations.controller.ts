import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateOpeningHoursDto } from './dto/update-opening-hours.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpsertLocationProfileDto } from './dto/upsert-location-profile.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get()
  async findAll(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findAll(scope.tenant.id),
      message: 'Locations retrieved successfully',
    };
  }

  @Post()
  async create(@Req() request: Request, @Body() dto: CreateLocationDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.create(
        scope.tenant.id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Location created successfully',
    };
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findOne(scope.tenant.id, id),
      message: 'Location retrieved successfully',
    };
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.update(
        scope.tenant.id,
        id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Location updated successfully',
    };
  }

  @Get(':id/profile')
  async getProfile(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findProfile(scope.tenant.id, id),
      message: 'Location profile retrieved successfully',
    };
  }

  @Post(':id/profile')
  async createProfile(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertLocationProfileDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.upsertProfile(
        scope.tenant.id,
        id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Location profile saved successfully',
    };
  }

  @Patch(':id/profile')
  async updateProfile(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertLocationProfileDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.upsertProfile(
        scope.tenant.id,
        id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Location profile updated successfully',
    };
  }

  @Get(':id/opening-hours')
  async getOpeningHours(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.getOpeningHours(scope.tenant.id, id),
      message: 'Opening hours retrieved successfully',
    };
  }

  @Put(':id/opening-hours')
  async updateOpeningHours(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpeningHoursDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.updateOpeningHours(
        scope.tenant.id,
        id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Opening hours updated successfully',
    };
  }
}
