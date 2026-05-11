import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductionBatchDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  productionPlanId?: string;

  @IsUUID()
  productVariantId!: string;

  @IsNumber()
  @Min(0.0001)
  plannedQty!: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;
}
