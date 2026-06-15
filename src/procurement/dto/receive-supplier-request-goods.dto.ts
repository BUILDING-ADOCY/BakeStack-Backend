import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceiveSupplierRequestGoodsLineDto {
  @IsUUID()
  supplierRequestItemId!: string;

  @IsNumber()
  @Min(0)
  receivedQty!: number;

  @IsNumber()
  @Min(0)
  acceptedQty!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rejectedQty?: number;

  @IsOptional()
  @IsString()
  supplierBatchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryAt?: string;
}

export class ReceiveSupplierRequestGoodsDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  receivedById?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveSupplierRequestGoodsLineDto)
  lines!: ReceiveSupplierRequestGoodsLineDto[];
}
