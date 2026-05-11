import { QCStatus } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateQcCheckDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  productionBatchId?: string;

  @IsOptional()
  @IsUUID()
  inventoryLotId?: string;

  @IsEnum(QCStatus)
  status!: QCStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  imageUrl?: string;
}
