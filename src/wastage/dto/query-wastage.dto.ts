import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { WasteReasonCode } from '@prisma/client';

export class QueryWastageDto {
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(WasteReasonCode)
  reasonCode?: WasteReasonCode;

  @IsOptional()
  @IsUUID('4')
  inventoryItemId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeVoided?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}

export class WastageRangeDto {
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class WastageTrendDto extends WastageRangeDto {
  @IsOptional()
  @IsIn(['day', 'week'])
  bucket?: 'day' | 'week' = 'day';
}

export class WastageLeaderboardDto extends WastageRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class WastageInsightsDto {
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number = 14;
}
