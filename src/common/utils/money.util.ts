import { Prisma } from '@prisma/client';

import { decimal } from './decimal.util';

/**
 * Money representation (BakeStack convention).
 *
 * - AMOUNTS (totals, line revenue, sales, COGS, gross profit, waste cost,
 *   labour, net estimate, ...) are integer MINOR UNITS ("paise"): one major
 *   unit = 100 minor units. They are stored in Postgres as `BigInt` and carried
 *   through the application as a JS integer `number`.
 * - PER-UNIT RATES (ingredient unit cost, sell price, ...) stay as
 *   `Prisma.Decimal` so sub-paise precision is preserved (e.g. flour at
 *   ₹35/kg = 3.5 paise/g). A rate is only rounded to minor units at the moment
 *   it becomes an amount (rate × quantity).
 *
 * Every major<->minor conversion must go through these helpers so the boundary
 * is explicit and consistent — never convert money ad hoc.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

const HALF_UP = Prisma.Decimal.ROUND_HALF_UP;

type DecimalLike = Prisma.Decimal | number | string;

/** Round any decimal/number to an integer count of minor units (paise). */
export const roundMinor = (value: DecimalLike): number =>
  decimal(value).toDecimalPlaces(0, HALF_UP).toNumber();

/** Convert a MAJOR-unit value (e.g. rupees) to integer minor units (paise). */
export const majorToMinor = (major: DecimalLike): number =>
  roundMinor(decimal(major).mul(MINOR_UNITS_PER_MAJOR));

/** Convert integer minor units (paise) to a MAJOR-unit number (e.g. rupees). */
export const minorToMajor = (minor: number | bigint): number =>
  decimal(minor.toString()).div(MINOR_UNITS_PER_MAJOR).toNumber();

/**
 * Multiply a per-unit RATE (Decimal, major units) by a quantity and round the
 * resulting AMOUNT to integer minor units (paise).
 */
export const rateTimesQtyToMinor = (
  rate: DecimalLike,
  quantity: DecimalLike,
): number => majorToMinor(decimal(rate).mul(decimal(quantity)));

/** Exact integer addition of a list of minor-unit amounts. */
export const sumMinor = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0);

/** Prisma `BigInt` write boundary: application integer paise -> storable bigint. */
export const toMinorStore = (minor: number): bigint =>
  BigInt(Math.round(minor));

/** Prisma `BigInt` read boundary: stored bigint (or number) -> application integer paise. */
export const fromMinorStore = (
  value: bigint | number | null | undefined,
): number => (value === null || value === undefined ? 0 : Number(value));
