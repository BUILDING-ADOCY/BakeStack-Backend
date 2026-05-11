import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { OptionalTenantScopeDto } from '../common/dto/optional-tenant-scope.dto';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ProcurementService } from './procurement.service';

@Controller()
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get('purchase-orders')
  async listPurchaseOrders(
    @Req() request: Request,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.procurementService.listPurchaseOrders(
        resolveTenantId(request, query.tenantId),
      ),
      message: 'Purchase orders retrieved successfully',
    };
  }

  @Post('purchase-orders')
  async createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return {
      data: await this.procurementService.createPurchaseOrder(dto),
      message: 'Purchase order created successfully',
    };
  }

  @Get('purchase-orders/:id')
  async findPurchaseOrder(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.procurementService.findPurchaseOrder(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Purchase order retrieved successfully',
    };
  }

  @Post('purchase-orders/:id/submit')
  async submitPurchaseOrder(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.procurementService.submitPurchaseOrder(
        resolveTenantId(request, body.tenantId),
        id,
      ),
      message: 'Purchase order submitted successfully',
    };
  }

  @Post('goods-receipts')
  async createGoodsReceipt(@Body() dto: CreateGoodsReceiptDto) {
    return {
      data: await this.procurementService.createGoodsReceipt(dto),
      message: 'Goods receipt created successfully',
    };
  }

  @Post('goods-receipts/:id/post')
  async postGoodsReceipt(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.procurementService.postGoodsReceipt(
        resolveTenantId(request, body.tenantId),
        id,
      ),
      message: 'Goods receipt posted successfully',
    };
  }
}
