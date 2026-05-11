import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRoleDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  @Type(() => Object)
  policyJson!: Record<string, unknown>;
}
