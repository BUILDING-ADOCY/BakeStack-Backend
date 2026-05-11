import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateRoleAssignmentDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsDateString()
  @Type(() => String)
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  @Type(() => String)
  effectiveTo?: string;
}
