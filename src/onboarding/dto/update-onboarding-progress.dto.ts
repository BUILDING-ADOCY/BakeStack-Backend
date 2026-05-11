import { SetupStepStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateOnboardingProgressDto {
  @IsOptional()
  @IsEnum(SetupStepStatus)
  businessProfileStatus?: SetupStepStatus;

  @IsOptional()
  @IsEnum(SetupStepStatus)
  locationSetupStatus?: SetupStepStatus;

  @IsOptional()
  @IsEnum(SetupStepStatus)
  cafeProfileStatus?: SetupStepStatus;

  @IsOptional()
  @IsEnum(SetupStepStatus)
  complianceStatus?: SetupStepStatus;

  @IsOptional()
  @IsEnum(SetupStepStatus)
  productSetupStatus?: SetupStepStatus;

  @IsOptional()
  @IsEnum(SetupStepStatus)
  inventorySetupStatus?: SetupStepStatus;

  @IsOptional()
  @IsEnum(SetupStepStatus)
  recipeSetupStatus?: SetupStepStatus;

  @IsOptional()
  @IsEnum(SetupStepStatus)
  supplierSetupStatus?: SetupStepStatus;

  @IsOptional()
  @IsEnum(SetupStepStatus)
  productionSetupStatus?: SetupStepStatus;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
