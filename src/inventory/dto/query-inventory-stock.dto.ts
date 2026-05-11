import { IsOptional, IsUUID } from 'class-validator';
import { OptionalLocationScopeDto } from '../../common/dto/optional-location-scope.dto';

export class QueryInventoryStockDto extends OptionalLocationScopeDto {
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;
}
