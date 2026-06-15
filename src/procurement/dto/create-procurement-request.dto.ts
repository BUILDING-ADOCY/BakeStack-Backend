import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProcurementSourceType } from '@prisma/client';

export class CreateProcurementRequestItemDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  @Min(0.0001)
  requiredQuantity!: number;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedPrice?: number;

  @IsOptional()
  @IsUUID()
  preferredSupplierId?: string;
}

export class CreateProcurementRequestDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsEnum(ProcurementSourceType)
  sourceType?: ProcurementSourceType;

  @IsDateString()
  requiredDate!: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  autoSend?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProcurementRequestItemDto)
  items!: CreateProcurementRequestItemDto[];
}
