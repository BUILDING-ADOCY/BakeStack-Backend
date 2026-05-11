import { IsOptional, IsUUID } from 'class-validator';
import { OptionalTenantScopeDto } from '../../common/dto/optional-tenant-scope.dto';

export class QueryProductionBatchesDto extends OptionalTenantScopeDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
