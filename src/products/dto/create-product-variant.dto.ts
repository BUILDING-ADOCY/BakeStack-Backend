import { ProductStatus } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateProductVariantDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultSellingPrice?: number;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
