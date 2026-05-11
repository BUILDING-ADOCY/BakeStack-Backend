import { InventoryItemType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateInventoryItemDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  name!: string;

  @IsEnum(InventoryItemType)
  type!: InventoryItemType;

  @IsString()
  defaultUom!: string;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  shelfLifeDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsBoolean()
  isPerishable?: boolean;
}
