import { IsString, Length } from 'class-validator';

export class VoidWasteEventDto {
  @IsString()
  @Length(5, 500)
  reason!: string;
}
