import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpsertLocationProfileDto {
  @IsOptional()
  @IsString()
  storeDisplayName?: string;

  @IsOptional()
  @IsString()
  storeManagerName?: string;

  @IsOptional()
  @IsString()
  storeManagerPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seatingCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tableCount?: number;

  @IsOptional()
  @IsString()
  kitchenType?: string;

  @IsOptional()
  @IsBoolean()
  hasInHouseKitchen?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCentralKitchen?: boolean;

  @IsOptional()
  @IsBoolean()
  hasDelivery?: boolean;

  @IsOptional()
  @IsBoolean()
  hasTakeaway?: boolean;

  @IsOptional()
  @IsBoolean()
  hasDineIn?: boolean;

  @IsOptional()
  @IsBoolean()
  hasWholesale?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCatering?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceModes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  averageDailyOrders?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  averageDailyRevenue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyRent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  staffCount?: number;

  @IsOptional()
  @IsString()
  productionStartTime?: string;

  @IsOptional()
  @IsString()
  productionEndTime?: string;

  @IsOptional()
  peakHoursJson?: Array<Record<string, unknown>> | null;

  @IsOptional()
  @IsString()
  cuisineOrProductFocus?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  signatureProductsJson?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCustomersJson?: string[];

  @IsOptional()
  @IsString()
  pricePositioning?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
