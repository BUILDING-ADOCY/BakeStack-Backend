import { Prisma } from '@prisma/client';

export const decimal = (value: Prisma.Decimal.Value) =>
  new Prisma.Decimal(value);

export const decimalMinZero = (value: Prisma.Decimal) =>
  value.lessThan(0) ? decimal(0) : value;
