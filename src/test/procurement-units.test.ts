import { describe, expect, it } from 'vitest';
import {
  autoConversionFactorBetweenUnits,
  convertInvoiceLineToPurchaseUnit,
  convertWithdrawalToUsageUnit,
  getCompatibleUnitsForItem,
  suggestPurchaseQuantity,
} from '@/lib/procurementUnits';
import { getProcurementPriceChange } from '@/lib/procurementPriceChanges';

describe('procurement invoice unit conversion', () => {
  const item = { purchaseUnit: 'kg', usageUnit: 'g', conversionFactor: 1000 };

  it('keeps values already expressed in the purchase unit', () => {
    expect(convertInvoiceLineToPurchaseUnit(2, 45, 'kg', item)).toMatchObject({
      quantity: 2,
      unitPrice: 45,
    });
  });

  describe('suggested procurement quantities', () => {
    it('converts usage-unit shortages into purchase units and targets twice the minimum', () => {
      expect(suggestPurchaseQuantity(1000, 0, 1000)).toBe(2);
      expect(suggestPurchaseQuantity(1000, 1500, 1000)).toBe(0.5);
    });
  });

  it('converts usage-unit quantity and cost back to the purchase unit', () => {
    expect(convertInvoiceLineToPurchaseUnit(2500, 0.045, 'g', item)).toMatchObject({
      quantity: 2.5,
      unitPrice: 45,
    });
  });

  it('does not silently accept incompatible units or invalid conversion factors', () => {
    expect(convertInvoiceLineToPurchaseUnit(2, 45, 'piece', item)).toBeNull();
    expect(convertInvoiceLineToPurchaseUnit(2, 45, 'g', { ...item, conversionFactor: 0 })).toBeNull();
    expect(convertInvoiceLineToPurchaseUnit(0, 45, 'kg', item)).toBeNull();
  });

  it('supports multi-tier Mushroom units (1 Carton = 10 Plates, 1 Plate = 200 g) for purchases and withdrawals', () => {
    const mushroom = {
      purchaseUnit: 'carton',
      usageUnit: 'plate',
      conversionFactor: 10,
      packSizeValue: 200,
      packSizeUnit: 'g' as const,
    };

    const units = getCompatibleUnitsForItem(mushroom).map((u) => u.unit);
    expect(units).toEqual(expect.arrayContaining(['plate', 'carton', 'g', 'kg']));

    // Purchase 5 plates @ 25 EGP -> 0.5 carton @ 250 EGP (= 5 plates in stock)
    expect(convertInvoiceLineToPurchaseUnit(5, 25, 'plate', mushroom)).toEqual({
      quantity: 0.5,
      unitPrice: 250,
      usageQuantity: 5,
    });
    // Purchase 2 cartons @ 250 EGP -> 2 cartons (= 20 plates in stock)
    expect(convertInvoiceLineToPurchaseUnit(2, 250, 'carton', mushroom)).toEqual({
      quantity: 2,
      unitPrice: 250,
      usageQuantity: 20,
    });

    // Withdraw by plate, carton, grams, or kilograms
    expect(convertWithdrawalToUsageUnit(3, 'plate', mushroom)).toBe(3);
    expect(convertWithdrawalToUsageUnit(1, 'carton', mushroom)).toBe(10);
    expect(convertWithdrawalToUsageUnit(400, 'g', mushroom)).toBe(2);
    expect(convertWithdrawalToUsageUnit(1, 'kg', mushroom)).toBe(5);
  });

  it('supports Chicken Breast bidirectional kg <-> g in both purchases and withdrawals even when conversionFactor=1', () => {
    const chicken = {
      purchaseUnit: 'kg',
      usageUnit: 'kg',
      conversionFactor: 1,
    };

    expect(convertInvoiceLineToPurchaseUnit(750, 0.19, 'g', chicken)).toEqual({
      quantity: 0.75,
      unitPrice: 190,
      usageQuantity: 0.75,
    });
    expect(convertWithdrawalToUsageUnit(500, 'g', chicken)).toBe(0.5);
    expect(convertWithdrawalToUsageUnit(2, 'kg', chicken)).toBe(2);
    expect(autoConversionFactorBetweenUnits('kg', 'g')).toBe(1000);
    expect(autoConversionFactorBetweenUnits('l', 'ml')).toBe(1000);
  });

  it('supports Sauce Jerrycans & Buckets with weight (kg/g) or volume (l/ml) conversion', () => {
    const ketchupJerrycan = {
      purchaseUnit: 'jerrycan',
      usageUnit: 'jerrycan',
      conversionFactor: 1,
      packSizeValue: 4.24,
      packSizeUnit: 'kg' as const,
    };
    expect(convertWithdrawalToUsageUnit(1060, 'g', ketchupJerrycan)).toBe(0.25);

    const mayoBucket = {
      purchaseUnit: 'bucket',
      usageUnit: 'l',
      conversionFactor: 10,
    };
    expect(convertWithdrawalToUsageUnit(500, 'ml', mayoBucket)).toBe(0.5);
    expect(convertWithdrawalToUsageUnit(1, 'bucket', mayoBucket)).toBe(10);
  });
});

describe('procurement price change detection', () => {
  it('calculates price increases against the last purchase price', () => {
    expect(getProcurementPriceChange(112, 100)).toEqual({ direction: 'increase', percentage: 12 });
  });

  it('detects decreases and ignores unchanged, missing, or invalid baselines', () => {
    expect(getProcurementPriceChange(90, 100)).toEqual({ direction: 'decrease', percentage: 10 });
    expect(getProcurementPriceChange(100, 100)).toBeNull();
    expect(getProcurementPriceChange(10, 0)).toBeNull();
    expect(getProcurementPriceChange(Number.NaN, 10)).toBeNull();
  });
});
