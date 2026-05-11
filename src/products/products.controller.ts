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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { OptionalTenantScopeDto } from '../common/dto/optional-tenant-scope.dto';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductImportDto } from './dto/create-product-import.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { QueryProductImportsDto } from './dto/query-product-imports.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get('product-categories')
  async listCategories(
    @Req() request: Request,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.productsService.listCategories(
        resolveTenantId(request, query.tenantId),
      ),
      message: 'Product categories retrieved successfully',
    };
  }

  @Post('product-categories')
  async createCategory(@Body() dto: CreateProductCategoryDto) {
    return {
      data: await this.productsService.createCategory(dto),
      message: 'Product category created successfully',
    };
  }

  @Get('products')
  async findAll(
    @Req() request: Request,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.productsService.findAll(
        resolveTenantId(request, query.tenantId),
      ),
      message: 'Products retrieved successfully',
    };
  }

  @Get('products/imports')
  async listImports(
    @Req() request: Request,
    @Query() query: QueryProductImportsDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.productsService.listImports(
        scope.tenant.id ?? query.tenantId,
      ),
      message: 'Product imports retrieved successfully',
    };
  }

  @Post('products')
  async create(@Body() dto: CreateProductDto) {
    return {
      data: await this.productsService.create(dto),
      message: 'Product created successfully',
    };
  }

  @Post('products/imports')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async importProducts(
    @Req() request: Request,
    @Body() dto: CreateProductImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.productsService.importFile(
        {
          ...dto,
          tenantId: scope.tenant.id,
          uploadedById: scope.user.id,
        },
        file,
      ),
      message: 'Product import processed successfully',
    };
  }

  @Get('products/:id')
  async findOne(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.productsService.findOne(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Product retrieved successfully',
    };
  }

  @Patch('products/:id')
  async update(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
    @Body() dto: UpdateProductDto,
  ) {
    return {
      data: await this.productsService.update(
        resolveTenantId(request, query.tenantId),
        id,
        dto,
      ),
      message: 'Product updated successfully',
    };
  }

  @Delete('products/:id')
  async remove(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.productsService.remove(
        resolveTenantId(request, query.tenantId),
        id,
      ),
      message: 'Product archived successfully',
    };
  }

  @Post('product-variants')
  async createVariant(@Body() dto: CreateProductVariantDto) {
    return {
      data: await this.productsService.createVariant(dto),
      message: 'Product variant created successfully',
    };
  }

  @Patch('product-variants/:id')
  async updateVariant(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OptionalTenantScopeDto,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return {
      data: await this.productsService.updateVariant(
        resolveTenantId(request, query.tenantId),
        id,
        dto,
      ),
      message: 'Product variant updated successfully',
    };
  }
}
