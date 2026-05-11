import { IsUUID } from 'class-validator';

export class TenantScopeDto {
  @IsUUID()
  tenantId!: string;
}
