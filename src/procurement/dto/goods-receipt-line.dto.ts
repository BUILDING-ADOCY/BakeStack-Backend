import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class GoodsReceiptLineDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  @Min(0.0001)
  receivedQty!: number;

  @IsNumber()
  @Min(0)
  acceptedQty!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rejectedQty?: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsString()
  supplierBatchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryAt?: string;
}
