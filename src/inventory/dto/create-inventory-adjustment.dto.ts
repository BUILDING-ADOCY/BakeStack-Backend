import { InventoryMovementType } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateInventoryAdjustmentDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsUUID()
  inventoryItemId!: string;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsIn(['INCREASE', 'DECREASE'])
  adjustmentType!: 'INCREASE' | 'DECREASE';

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsEnum(InventoryMovementType)
  movementType?: InventoryMovementType;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;
}
