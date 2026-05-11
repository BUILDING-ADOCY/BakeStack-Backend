import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductCategoryDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
