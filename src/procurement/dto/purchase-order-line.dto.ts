import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class PurchaseOrderLineDto {
  @IsOptional()
  @IsUUID()
  supplierItemId?: string;

  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  @Min(0.0001)
  orderedQty!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}
