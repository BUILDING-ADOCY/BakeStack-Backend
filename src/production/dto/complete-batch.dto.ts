import { IsNumber, IsOptional, Min } from 'class-validator';
import { BatchActionDto } from './batch-action.dto';

export class CompleteBatchDto extends BatchActionDto {
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  actualOutputQty?: number;
}
