import { IsOptional, IsUUID } from 'class-validator';
import { OptionalTenantScopeDto } from '../../common/dto/optional-tenant-scope.dto';

export class QueryInventoryImportsDto extends OptionalTenantScopeDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
