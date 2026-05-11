import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TenantStatus } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsString()
  timezone!: string;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
