import { WasteReasonCode } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateWasteEventDto {
  @IsUUID('4')
  locationId!: string;

  @IsUUID('4')
  inventoryItemId!: string;

  @IsOptional()
  @IsUUID('4')
  lotId?: string;

  @IsOptional()
  @IsUUID('4')
  productionBatchId?: string;

  @IsString()
  @Matches(/^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,4})?$/, {
    message: 'quantity must be a positive decimal string',
  })
  quantity!: string;

  @IsString()
  @Length(1, 32)
  uom!: string;

  @IsEnum(WasteReasonCode)
  reasonCode!: WasteReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
