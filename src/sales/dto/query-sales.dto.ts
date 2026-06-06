import { IsDateString, IsOptional, IsUUID } from 'class-validator';

import { OptionalTenantScopeDto } from '../../common/dto/optional-tenant-scope.dto';

export class QuerySalesDto extends OptionalTenantScopeDto {
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsDateString()
  businessDate?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
