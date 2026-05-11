import { IsUUID } from 'class-validator';
import { OptionalTenantScopeDto } from './optional-tenant-scope.dto';

export class OptionalLocationScopeDto extends OptionalTenantScopeDto {
  @IsUUID()
  locationId!: string;
}
