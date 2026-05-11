import { IsOptional, IsUUID } from 'class-validator';
import { OptionalTenantScopeDto } from '../../common/dto/optional-tenant-scope.dto';

export class QueryRecipesDto extends OptionalTenantScopeDto {
  @IsOptional()
  @IsUUID()
  productVariantId?: string;
}
