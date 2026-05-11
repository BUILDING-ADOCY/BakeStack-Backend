import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProductionPlanDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsDateString()
  planDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;
}
