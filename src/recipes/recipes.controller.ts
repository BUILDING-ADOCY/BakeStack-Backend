import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';
import type { Request } from 'express';
import { OptionalTenantScopeDto } from '../common/dto/optional-tenant-scope.dto';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { QueryRecipesDto } from './dto/query-recipes.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { RecipesService } from './recipes.service';

class RecipeCostingQueryDto extends OptionalTenantScopeDto {
  @IsUUID()
  locationId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  plannedQty = 1;
}

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  async findAll(@Req() request: Request, @Query() query: QueryRecipesDto) {
    return {
      data: await this.recipesService.findAll({
        ...query,
        tenantId: resolveTenantId(request, query.tenantId),
      }),
      message: 'Recipes retrieved successfully',
    };
  }

  @Post()
  async create(@Body() dto: CreateRecipeDto) {
    return {
      data: await this.recipesService.create(dto),
      message: 'Recipe created successfully',
    };
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.recipesService.findOne(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Recipe retrieved successfully',
    };
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
    @Body() dto: UpdateRecipeDto,
  ) {
    return {
      data: await this.recipesService.update(
        resolveTenantId(request, query.tenantId),
        id,
        dto,
      ),
      message: 'Recipe updated successfully',
    };
  }

  @Post(':id/activate')
  async activate(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.recipesService.activate(
        resolveTenantId(request, body.tenantId),
        id,
      ),
      message: 'Recipe activated successfully',
    };
  }

  @Delete(':id')
  async remove(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.recipesService.remove(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Recipe archived successfully',
    };
  }

  @Get(':id/costing')
  async getCosting(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RecipeCostingQueryDto,
  ) {
    const tenantId = resolveTenantId(request, query.tenantId);

    return {
      data: await this.recipesService.calculateRecipeCosting(
        tenantId,
        id,
        query.locationId,
        query.plannedQty,
      ),
      message: 'Recipe costing calculated successfully',
    };
  }
}
