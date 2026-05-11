import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateInventoryImportDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  uploadedById?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return value === 'true' || value === true;
  })
  @IsBoolean()
  continueOnError?: boolean = true;
}
