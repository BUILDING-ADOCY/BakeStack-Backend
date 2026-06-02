import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSupplierItemDto {
  @IsOptional()
  @IsString()
  supplierSku?: string;

  @IsOptional()
  @IsString()
  purchaseUom?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  packSize?: number;
}
