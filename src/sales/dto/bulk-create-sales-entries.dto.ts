import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { CreateSalesEntryDto } from './create-sales-entry.dto';

export class BulkCreateSalesEntriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesEntryDto)
  entries!: CreateSalesEntryDto[];
}
