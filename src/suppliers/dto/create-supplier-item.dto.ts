import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateSupplierItemDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  supplierId!: string;

  @IsUUID()
  inventoryItemId!: string;

  @IsOptional()
  @IsString()
  supplierSku?: string;

  @IsString()
  purchaseUom!: string;

  @IsNumber()
  @Min(0.0001)
  packSize!: number;

  @IsNumber()
  @Min(0)
  currentPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  minOrderQty?: number;
}
