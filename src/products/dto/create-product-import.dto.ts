import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateProductImportDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  uploadedById?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }

    return value;
  })
  @IsBoolean()
  continueOnError?: boolean;
}
