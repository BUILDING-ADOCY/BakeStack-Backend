import { QCStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class QueryQcChecksDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  productionBatchId?: string;

  @IsOptional()
  @IsEnum(QCStatus)
  status?: QCStatus;
}
