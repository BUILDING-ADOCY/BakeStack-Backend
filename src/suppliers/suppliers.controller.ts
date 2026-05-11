import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { OptionalTenantScopeDto } from '../common/dto/optional-tenant-scope.dto';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { CreateSupplierItemDto } from './dto/create-supplier-item.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller()
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get('suppliers')
  async findAll(
    @Req() request: Request,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.suppliersService.findAll(
        resolveTenantId(request, query.tenantId),
      ),
      message: 'Suppliers retrieved successfully',
    };
  }

  @Post('suppliers')
  async create(@Body() dto: CreateSupplierDto) {
    return {
      data: await this.suppliersService.create(dto),
      message: 'Supplier created successfully',
    };
  }

  @Get('suppliers/:id')
  async findOne(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.suppliersService.findOne(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Supplier retrieved successfully',
    };
  }

  @Patch('suppliers/:id')
  async update(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
    @Body() dto: UpdateSupplierDto,
  ) {
    return {
      data: await this.suppliersService.update(
        resolveTenantId(request, query.tenantId),
        id,
        dto,
      ),
      message: 'Supplier updated successfully',
    };
  }

  @Get('supplier-items')
  async listSupplierItems(
    @Req() request: Request,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.suppliersService.listSupplierItems(
        resolveTenantId(request, query.tenantId),
      ),
      message: 'Supplier items retrieved successfully',
    };
  }

  @Post('supplier-items')
  async createSupplierItem(@Body() dto: CreateSupplierItemDto) {
    return {
      data: await this.suppliersService.createSupplierItem(dto),
      message: 'Supplier item created successfully',
    };
  }
}
