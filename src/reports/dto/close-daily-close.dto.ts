import { IsOptional, IsUUID } from 'class-validator';
import { CreateDailyClosePreviewDto } from './create-daily-close-preview.dto';

export class CloseDailyCloseDto extends CreateDailyClosePreviewDto {
  @IsOptional()
  @IsUUID()
  closedById?: string;
}
