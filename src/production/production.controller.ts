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
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { BatchActionDto } from './dto/batch-action.dto';
import { CompleteBatchDto } from './dto/complete-batch.dto';
import { CreateProductionBatchDto } from './dto/create-production-batch.dto';
import { CreateProductionPlanDto } from './dto/create-production-plan.dto';
import { QueryProductionBatchesDto } from './dto/query-production-batches.dto';
import { ProductionService } from './production.service';

@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('plans')
  async listPlans(
    @Req() request: Request,
    @Query() query: QueryProductionBatchesDto,
  ) {
    return {
      data: await this.productionService.listPlans({
        ...query,
        tenantId: resolveTenantId(request, query.tenantId),
      }),
      message: 'Production plans retrieved successfully',
    };
  }

  @Post('plans')
  async createPlan(@Body() dto: CreateProductionPlanDto) {
    return {
      data: await this.productionService.createProductionPlan(dto),
      message: 'Production plan created successfully',
    };
  }

  @Get('batches')
  async listBatches(
    @Req() request: Request,
    @Query() query: QueryProductionBatchesDto,
  ) {
    return {
      data: await this.productionService.listBatches({
        ...query,
        tenantId: resolveTenantId(request, query.tenantId),
      }),
      message: 'Production batches retrieved successfully',
    };
  }

  @Post('batches')
  async createBatch(@Body() dto: CreateProductionBatchDto) {
    return {
      data: await this.productionService.createProductionBatch(dto),
      message: 'Production batch created successfully',
    };
  }

  @Get('batches/:id')
  async findBatch(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryProductionBatchesDto,
  ) {
    return {
      data: await this.productionService.findBatch(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Production batch retrieved successfully',
    };
  }

  @Post('batches/:id/approve')
  async approveBatch(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BatchActionDto,
  ) {
    return {
      data: await this.productionService.approveBatch(id, {
        ...dto,
        tenantId: resolveTenantId(request, dto.tenantId),
        actorId: request.provisionedIdentity?.user.id ?? dto.actorId,
      }),
      message: 'Production batch approved successfully',
    };
  }

  @Post('batches/:id/start')
  async startBatch(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BatchActionDto,
  ) {
    return {
      data: await this.productionService.startBatch(id, {
        ...dto,
        tenantId: resolveTenantId(request, dto.tenantId),
        actorId: request.provisionedIdentity?.user.id ?? dto.actorId,
      }),
      message: 'Production batch started successfully',
    };
  }

  @Post('batches/:id/complete')
  async completeBatch(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteBatchDto,
  ) {
    return {
      data: await this.productionService.completeBatch(id, {
        ...dto,
        tenantId: resolveTenantId(request, dto.tenantId),
        actorId: request.provisionedIdentity?.user.id ?? dto.actorId,
      }),
      message: 'Production batch completed successfully',
    };
  }

  @Post('batches/:id/cancel')
  async cancelBatch(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BatchActionDto,
  ) {
    return {
      data: await this.productionService.cancelBatch(id, {
        ...dto,
        tenantId: resolveTenantId(request, dto.tenantId),
        actorId: request.provisionedIdentity?.user.id ?? dto.actorId,
      }),
      message: 'Production batch cancelled successfully',
    };
  }
}
