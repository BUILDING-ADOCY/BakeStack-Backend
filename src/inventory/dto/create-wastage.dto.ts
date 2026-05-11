import { WasteReasonCode } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateWastageDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsUUID()
  inventoryItemId!: string;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsOptional()
  @IsUUID()
  productionBatchId?: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  uom!: string;

  @IsEnum(WasteReasonCode)
  reasonCode!: WasteReasonCode;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  recordedById?: string;
}
