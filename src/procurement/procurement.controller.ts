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
import { SupplierMessageChannel, SupplierRequestStatus } from '@prisma/client';
import type { Request } from 'express';
import { OptionalTenantScopeDto } from '../common/dto/optional-tenant-scope.dto';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { AddSupplierResponseDto } from './dto/add-supplier-response.dto';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { CreateProcurementRequestDto } from './dto/create-procurement-request.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceiveSupplierRequestGoodsDto } from './dto/receive-supplier-request-goods.dto';
import {
  AcceptSupplierQuotationDto,
  RejectSupplierQuotationDto,
} from './dto/supplier-quotation-action.dto';
import { ProcurementService } from './procurement.service';

@Controller()
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get('procurement-requests')
  async listProcurementRequests(
    @Req() request: Request,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.procurementService.listProcurementRequests(
        resolveTenantId(request, query.tenantId),
      ),
      message: 'Procurement requests retrieved successfully',
    };
  }

  @Post('procurement-requests')
  async createProcurementRequest(@Body() dto: CreateProcurementRequestDto) {
    return {
      data: await this.procurementService.createProcurementRequest(dto),
      message: 'Procurement request created successfully',
    };
  }

  @Get('procurement-requests/:id')
  async findProcurementRequest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.procurementService.findProcurementRequest(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Procurement request retrieved successfully',
    };
  }

  @Get('supplier-requests')
  async listSupplierRequests(
    @Req() request: Request,
    @Query() query: OptionalTenantScopeDto & { status?: string },
  ) {
    return {
      data: await this.procurementService.listSupplierRequests(
        resolveTenantId(request, query.tenantId),
        query.status as SupplierRequestStatus | undefined,
      ),
      message: 'Supplier requests retrieved successfully',
    };
  }

  @Get('supplier-requests/:id')
  async findSupplierRequest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.procurementService.findSupplierRequest(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Supplier request retrieved successfully',
    };
  }

  @Post('supplier-requests/:id/send')
  async sendSupplierRequest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: OptionalTenantScopeDto & { actorId?: string; channel?: string },
  ) {
    return {
      data: await this.procurementService.sendSupplierRequest(
        resolveTenantId(request, body.tenantId),
        id,
        body.actorId ?? request.context?.actorId,
        body.channel as SupplierMessageChannel | undefined,
      ),
      message: 'Supplier request send state updated successfully',
    };
  }

  @Post('supplier-requests/:id/reminders')
  async sendSupplierReminder(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OptionalTenantScopeDto & { actorId?: string },
  ) {
    return {
      data: await this.procurementService.sendSupplierReminder(
        resolveTenantId(request, body.tenantId),
        id,
        body.actorId ?? request.context?.actorId,
      ),
      message: 'Supplier reminder send state updated successfully',
    };
  }

  @Post('supplier-requests/:id/responses')
  async addSupplierResponse(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSupplierResponseDto,
  ) {
    return {
      data: await this.procurementService.addSupplierResponse(
        resolveTenantId(request, dto.tenantId),
        id,
        dto,
      ),
      message: 'Supplier response recorded successfully',
    };
  }

  @Post('supplier-quotations/:id/accept')
  async acceptSupplierQuotation(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptSupplierQuotationDto,
  ) {
    return {
      data: await this.procurementService.acceptSupplierQuotation(
        resolveTenantId(request, dto.tenantId),
        id,
        {
          ...dto,
          createdById: dto.createdById ?? request.context?.actorId,
        },
      ),
      message: 'Supplier quotation accepted successfully',
    };
  }

  @Post('supplier-quotations/:id/reject')
  async rejectSupplierQuotation(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSupplierQuotationDto,
  ) {
    return {
      data: await this.procurementService.rejectSupplierQuotation(
        resolveTenantId(request, dto.tenantId),
        id,
        {
          ...dto,
          actorId: dto.actorId ?? request.context?.actorId,
        },
      ),
      message: 'Supplier quotation rejected successfully',
    };
  }

  @Post('supplier-requests/:id/goods-receipts')
  async receiveSupplierRequestGoods(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveSupplierRequestGoodsDto,
  ) {
    return {
      data: await this.procurementService.receiveSupplierRequestGoods(
        resolveTenantId(request, dto.tenantId),
        id,
        {
          ...dto,
          receivedById: dto.receivedById ?? request.context?.actorId,
        },
      ),
      message: 'Supplier goods receipt posted successfully',
    };
  }

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
        request.context?.actorId,
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
