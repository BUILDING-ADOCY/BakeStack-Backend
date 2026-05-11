import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { GoodsReceiptLineDto } from './goods-receipt-line.dto';

export class CreateGoodsReceiptDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsUUID()
  receivedById?: string;

  @IsDateString()
  receivedAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}
