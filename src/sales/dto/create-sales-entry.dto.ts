import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const POSITIVE_DECIMAL = /^(?!0+(?:\.0+)?$)\d+(?:\.\d{1,4})?$/;
const NON_NEGATIVE_DECIMAL = /^\d+(?:\.\d{1,2})?$/;

export class CreateSalesEntryDto {
  @IsUUID('4')
  locationId!: string;

  @IsUUID('4')
  productVariantId!: string;

  @IsDateString()
  businessDate!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'units must be a positive decimal string',
  })
  units!: string;

  // Optional: defaults to the location's selling price, else the variant default.
  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, {
    message: 'unitSellPrice must be a non-negative decimal string',
  })
  unitSellPrice?: string;
}
