import { ComplianceStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class UpsertComplianceProfileDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Z]{15}$/i, {
    message: 'GSTIN must be 15 alphanumeric characters.',
  })
  gstin?: string;

  @IsOptional()
  @IsString()
  fssaiLicenseNumber?: string;

  @IsOptional()
  @IsDateString()
  fssaiExpiryDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/i, {
    message: 'PAN must follow the standard PAN format.',
  })
  panNumber?: string;

  @IsOptional()
  @IsString()
  businessRegistrationNumber?: string;

  @IsOptional()
  @IsEnum(ComplianceStatus)
  status?: ComplianceStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
