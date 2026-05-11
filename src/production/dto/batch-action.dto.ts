import { IsOptional, IsUUID } from 'class-validator';
import { OptionalTenantScopeDto } from '../../common/dto/optional-tenant-scope.dto';

export class BatchActionDto extends OptionalTenantScopeDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;
}
