import { IsUUID } from 'class-validator';
import { TenantScopeDto } from './tenant-scope.dto';

export class LocationScopeDto extends TenantScopeDto {
  @IsUUID()
  locationId!: string;
}
