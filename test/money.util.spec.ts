import { Prisma } from '@prisma/client';

import {
  MINOR_UNITS_PER_MAJOR,
  fromMinorStore,
  majorToMinor,
  minorToMajor,
  rateTimesQtyToMinor,
  roundMinor,
  sumMinor,
  toMinorStore,
} from '../src/common/utils/money.util';

describe('money.util', () => {
  it('exposes the minor-unit scale', () => {
    expect(MINOR_UNITS_PER_MAJOR).toBe(100);
  });

  describe('majorToMinor', () => {
    it('converts whole and fractional major units to integer paise', () => {
      expect(majorToMinor(3)).toBe(300);
      expect(majorToMinor('3.5')).toBe(350);
      expect(majorToMinor(new Prisma.Decimal('12.34'))).toBe(1234);
    });

    it('rounds half-up to the nearest minor unit', () => {
      expect(majorToMinor(2.555)).toBe(256);
      expect(majorToMinor(2.554)).toBe(255);
    });
  });

  describe('minorToMajor', () => {
    it('converts integer paise back to a major-unit number', () => {
      expect(minorToMajor(300)).toBe(3);
      expect(minorToMajor(350)).toBe(3.5);
      expect(minorToMajor(12345n)).toBe(123.45);
    });
  });

  describe('rateTimesQtyToMinor', () => {
    it('multiplies a major-unit rate by a quantity into integer paise', () => {
      expect(rateTimesQtyToMinor('3', '2')).toBe(600);
      expect(rateTimesQtyToMinor('3.5', 2)).toBe(700);
    });

    it('preserves sub-paise rate precision until it becomes an amount', () => {
      // 0.035 major = 3.5 paise per unit; × 10 = 35 paise exactly.
      expect(rateTimesQtyToMinor('0.035', '10')).toBe(35);
      // 3.5 paise × 1 rounds half-up to 4 paise only at the amount boundary.
      expect(rateTimesQtyToMinor('0.035', '1')).toBe(4);
    });
  });

  describe('roundMinor / sumMinor', () => {
    it('rounds to whole minor units half-up', () => {
      expect(roundMinor(255.5)).toBe(256);
      expect(roundMinor(255.4)).toBe(255);
    });

    it('adds minor-unit amounts exactly', () => {
      expect(sumMinor([100, 200, 50])).toBe(350);
      expect(sumMinor([])).toBe(0);
    });
  });

  describe('Prisma BigInt boundary', () => {
    it('round-trips through storable bigint', () => {
      expect(toMinorStore(300)).toBe(300n);
      expect(fromMinorStore(300n)).toBe(300);
      expect(fromMinorStore(null)).toBe(0);
      expect(fromMinorStore(undefined)).toBe(0);
    });
  });
});
