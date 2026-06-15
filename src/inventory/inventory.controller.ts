import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { OptionalTenantScopeDto } from '../common/dto/optional-tenant-scope.dto';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { CreateInventoryImportDto } from './dto/create-inventory-import.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateOpeningStockDto } from './dto/create-opening-stock.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import { QueryInventoryImportsDto } from './dto/query-inventory-imports.dto';
import { QueryInventoryMovementsDto } from './dto/query-inventory-movements.dto';
import { QueryInventoryStockDto } from './dto/query-inventory-stock.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('items')
  async listItems(
    @Req() request: Request,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.inventoryService.listItems(
        resolveTenantId(request, query.tenantId),
      ),
      message: 'Inventory items retrieved successfully',
    };
  }

  @Post('items')
  async createItem(@Body() dto: CreateInventoryItemDto) {
    return {
      data: await this.inventoryService.createItem(dto),
      message: 'Inventory item created successfully',
    };
  }

  @Delete('items/:id')
  async removeItem(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.inventoryService.removeItem(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Inventory item archived successfully',
    };
  }

  @Get('imports')
  async listImports(
    @Req() request: Request,
    @Query() query: QueryInventoryImportsDto,
  ) {
    return {
      data: await this.inventoryService.listImports({
        ...query,
        tenantId: resolveTenantId(request, query.tenantId),
      }),
      message: 'Inventory imports retrieved successfully',
    };
  }

  @Get('balances')
  async getBalances(
    @Req() request: Request,
    @Query() query: QueryInventoryStockDto,
  ) {
    return {
      data: await this.inventoryService.getBalances({
        ...query,
        tenantId: resolveTenantId(request, query.tenantId),
      }),
      message: 'Inventory balances retrieved successfully',
    };
  }

  @Get('movements')
  async getMovements(
    @Req() request: Request,
    @Query() query: QueryInventoryMovementsDto,
  ) {
    return {
      data: await this.inventoryService.getMovements({
        ...query,
        tenantId: resolveTenantId(request, query.tenantId),
      }),
      message: 'Inventory movements retrieved successfully',
    };
  }

  @Post('opening-stock')
  async recordOpeningStock(@Body() dto: CreateOpeningStockDto) {
    return {
      data: await this.inventoryService.recordOpeningStock(dto),
      message: 'Opening stock recorded successfully',
    };
  }

  @Post('adjustments')
  async adjustStock(@Body() dto: CreateInventoryAdjustmentDto) {
    return {
      data: await this.inventoryService.adjustStock(dto),
      message: 'Inventory adjustment recorded successfully',
    };
  }

  @Post('waste')
  async recordWastage(@Body() dto: CreateWastageDto) {
    return {
      data: await this.inventoryService.recordWastage(dto),
      message: 'Wastage recorded successfully',
    };
  }

  @Post('imports')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 2 * 1024 * 1024,
      },
    }),
  )
  async importInventoryFile(
    @Body() dto: CreateInventoryImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return {
      data: await this.inventoryService.importFile(dto, file),
      message: 'Inventory import processed successfully',
    };
  }
}
