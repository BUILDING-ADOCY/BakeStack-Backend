import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateDailyClosePreviewDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsDateString()
  businessDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  labourCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salesTotal?: number;
}
