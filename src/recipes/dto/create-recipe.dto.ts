import { RecipeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecipeComponentDto } from './recipe-component.dto';

export class CreateRecipeDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  productVariantId!: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(1)
  version!: number;

  @IsNumber()
  @Min(0.0001)
  batchYieldQty!: number;

  @IsString()
  yieldUom!: string;

  @IsOptional()
  @IsEnum(RecipeStatus)
  status?: RecipeStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeComponentDto)
  components!: RecipeComponentDto[];
}
