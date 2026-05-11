import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderLineDto } from './purchase-order-line.dto';

export class CreatePurchaseOrderDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}
