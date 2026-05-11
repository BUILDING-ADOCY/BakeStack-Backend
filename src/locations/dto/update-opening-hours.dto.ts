import { DayOfWeek } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OpeningHourInputDto {
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsOptional()
  @IsString()
  openTime?: string;

  @IsOptional()
  @IsString()
  closeTime?: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class UpdateOpeningHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningHourInputDto)
  openingHours!: OpeningHourInputDto[];
}
