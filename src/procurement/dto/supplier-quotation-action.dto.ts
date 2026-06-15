import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class AcceptSupplierQuotationDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;
}

export class RejectSupplierQuotationDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
