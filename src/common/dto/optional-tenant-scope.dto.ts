import { IsOptional, IsUUID } from 'class-validator';

export class OptionalTenantScopeDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
