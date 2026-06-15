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
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { BulkCreateWasteEventsDto } from './dto/bulk-create-waste-events.dto';
import { CreateWasteEventDto } from './dto/create-waste-event.dto';
import {
  QueryWastageDto,
  WastageInsightsDto,
  WastageLeaderboardDto,
  WastageRangeDto,
  WastageTrendDto,
} from './dto/query-wastage.dto';
import { VoidWasteEventDto } from './dto/void-waste-event.dto';
import { WastageService } from './wastage.service';

@Controller('wastage')
export class WastageController {
  constructor(
    private readonly wastageService: WastageService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Post()
  async create(@Req() request: Request, @Body() dto: CreateWasteEventDto) {
    const identity =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );
    return {
      data: await this.wastageService.recordWasteEvent(
        resolveTenantId(request),
        identity.user.id,
        dto,
      ),
      message: 'Wastage recorded successfully',
    };
  }

  @Post('bulk')
  async bulkCreate(
    @Req() request: Request,
    @Body() dto: BulkCreateWasteEventsDto,
  ) {
    const identity =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );
    return {
      data: await this.wastageService.bulkRecordWasteEvents(
        resolveTenantId(request),
        identity.user.id,
        dto,
      ),
      message: 'Wastage events recorded successfully',
    };
  }

  @Post(':id/void')
  async void(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidWasteEventDto,
  ) {
    const identity =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );
    return {
      data: await this.wastageService.voidWasteEvent(
        resolveTenantId(request),
        identity.user.id,
        id,
        dto,
      ),
      message: 'Wastage event voided successfully',
    };
  }

  @Get()
  async list(@Req() request: Request, @Query() query: QueryWastageDto) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.wastageService.list(
        resolveTenantId(request, query.tenantId),
        query,
      ),
      message: 'Wastage events retrieved successfully',
    };
  }

  @Get('summary')
  async summary(@Req() request: Request, @Query() query: WastageRangeDto) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.wastageService.getSummary(
        resolveTenantId(request, query.tenantId),
        query,
      ),
      message: 'Wastage summary retrieved successfully',
    };
  }

  @Get('trend')
  async trend(@Req() request: Request, @Query() query: WastageTrendDto) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.wastageService.getTrend(
        resolveTenantId(request, query.tenantId),
        query,
      ),
      message: 'Wastage trend retrieved successfully',
    };
  }

  @Get('leaderboard')
  async leaderboard(
    @Req() request: Request,
    @Query() query: WastageLeaderboardDto,
  ) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.wastageService.getLeaderboard(
        resolveTenantId(request, query.tenantId),
        query,
      ),
      message: 'Wastage leaderboard retrieved successfully',
    };
  }

  @Get('by-reason')
  async byReason(@Req() request: Request, @Query() query: WastageRangeDto) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.wastageService.getByReason(
        resolveTenantId(request, query.tenantId),
        query,
      ),
      message: 'Wastage reason breakdown retrieved successfully',
    };
  }

  @Get('branch-comparison')
  async branchComparison(
    @Req() request: Request,
    @Query() query: WastageRangeDto,
  ) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.wastageService.getBranchComparison(
        resolveTenantId(request, query.tenantId),
        query,
      ),
      message: 'Wastage branch comparison retrieved successfully',
    };
  }

  @Get('insights')
  async insights(@Req() request: Request, @Query() query: WastageInsightsDto) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.wastageService.getInsights(
        resolveTenantId(request, query.tenantId),
        query,
      ),
      message: 'Wastage insights retrieved successfully',
    };
  }

  @Get(':id')
  async getById(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryWastageDto,
  ) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.wastageService.getById(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Wastage event retrieved successfully',
    };
  }
}
