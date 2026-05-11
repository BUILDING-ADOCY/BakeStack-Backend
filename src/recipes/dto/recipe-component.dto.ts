import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RecipeComponentDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  uom!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lossFactorPercent?: number;
}
