import {
  Body,
  Controller,
  Delete,
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
import { UpsertInventoryItemSettingDto } from './dto/upsert-inventory-item-setting.dto';
import { UpdateOpeningHoursDto } from './dto/update-opening-hours.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpsertLocationProfileDto } from './dto/upsert-location-profile.dto';
import { UpsertProductVariantSettingDto } from './dto/upsert-product-variant-setting.dto';
import { UpsertSupplierItemSettingDto } from './dto/upsert-supplier-item-setting.dto';
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

  @Get(':id/money-readiness')
  async getMoneyReadiness(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.getMoneyReadiness(scope.tenant.id, id),
      message: 'Location money readiness retrieved successfully',
    };
  }

  @Get(':id/local-settings/product-variants')
  async findProductVariantSettings(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findProductVariantSettings(
        scope.tenant.id,
        id,
      ),
      message: 'Location product variant settings retrieved successfully',
    };
  }

  @Get(':id/local-settings/product-variants/:productVariantId')
  async findProductVariantSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productVariantId', ParseUUIDPipe) productVariantId: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findProductVariantSetting(
        scope.tenant.id,
        id,
        productVariantId,
      ),
      message: 'Location product variant setting retrieved successfully',
    };
  }

  @Put(':id/local-settings/product-variants/:productVariantId')
  async upsertProductVariantSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productVariantId', ParseUUIDPipe) productVariantId: string,
    @Body() dto: UpsertProductVariantSettingDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.upsertProductVariantSetting(
        scope.tenant.id,
        id,
        productVariantId,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Location product variant setting saved successfully',
    };
  }

  @Delete(':id/local-settings/product-variants/:productVariantId')
  async deleteProductVariantSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productVariantId', ParseUUIDPipe) productVariantId: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.deleteProductVariantSetting(
        scope.tenant.id,
        id,
        productVariantId,
        scope.user.id,
        request.context?.correlationId,
      ),
      message: 'Location product variant setting deleted successfully',
    };
  }

  @Get(':id/local-settings/inventory-items')
  async findInventoryItemSettings(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findInventoryItemSettings(
        scope.tenant.id,
        id,
      ),
      message: 'Location inventory item settings retrieved successfully',
    };
  }

  @Get(':id/local-settings/inventory-items/:inventoryItemId')
  async findInventoryItemSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inventoryItemId', ParseUUIDPipe) inventoryItemId: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findInventoryItemSetting(
        scope.tenant.id,
        id,
        inventoryItemId,
      ),
      message: 'Location inventory item setting retrieved successfully',
    };
  }

  @Put(':id/local-settings/inventory-items/:inventoryItemId')
  async upsertInventoryItemSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inventoryItemId', ParseUUIDPipe) inventoryItemId: string,
    @Body() dto: UpsertInventoryItemSettingDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.upsertInventoryItemSetting(
        scope.tenant.id,
        id,
        inventoryItemId,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Location inventory item setting saved successfully',
    };
  }

  @Delete(':id/local-settings/inventory-items/:inventoryItemId')
  async deleteInventoryItemSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inventoryItemId', ParseUUIDPipe) inventoryItemId: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.deleteInventoryItemSetting(
        scope.tenant.id,
        id,
        inventoryItemId,
        scope.user.id,
        request.context?.correlationId,
      ),
      message: 'Location inventory item setting deleted successfully',
    };
  }

  @Get(':id/local-settings/supplier-items')
  async findSupplierItemSettings(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findSupplierItemSettings(
        scope.tenant.id,
        id,
      ),
      message: 'Location supplier item settings retrieved successfully',
    };
  }

  @Get(':id/local-settings/supplier-items/:supplierItemId')
  async findSupplierItemSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('supplierItemId', ParseUUIDPipe) supplierItemId: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.findSupplierItemSetting(
        scope.tenant.id,
        id,
        supplierItemId,
      ),
      message: 'Location supplier item setting retrieved successfully',
    };
  }

  @Put(':id/local-settings/supplier-items/:supplierItemId')
  async upsertSupplierItemSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('supplierItemId', ParseUUIDPipe) supplierItemId: string,
    @Body() dto: UpsertSupplierItemSettingDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.upsertSupplierItemSetting(
        scope.tenant.id,
        id,
        supplierItemId,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Location supplier item setting saved successfully',
    };
  }

  @Delete(':id/local-settings/supplier-items/:supplierItemId')
  async deleteSupplierItemSetting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('supplierItemId', ParseUUIDPipe) supplierItemId: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.locationsService.deleteSupplierItemSetting(
        scope.tenant.id,
        id,
        supplierItemId,
        scope.user.id,
        request.context?.correlationId,
      ),
      message: 'Location supplier item setting deleted successfully',
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
