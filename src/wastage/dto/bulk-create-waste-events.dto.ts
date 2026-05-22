import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateWasteEventDto } from './create-waste-event.dto';

export class BulkCreateWasteEventsDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateWasteEventDto)
  events!: CreateWasteEventDto[];
}
