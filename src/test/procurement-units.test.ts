import { describe, expect, it } from 'vitest';
import { convertInvoiceLineToPurchaseUnit, suggestPurchaseQuantity } from '@/lib/procurementUnits';
import { getProcurementPriceChange } from '@/lib/procurementPriceChanges';

describe('procurement invoice unit conversion', () => {
  const item = { purchaseUnit: 'kg', usageUnit: 'g', conversionFactor: 1000 };

  it('keeps values already expressed in the purchase unit', () => {
    expect(convertInvoiceLineToPurchaseUnit(2, 45, 'kg', item)).toEqual({
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
    expect(convertInvoiceLineToPurchaseUnit(2500, 0.045, 'g', item)).toEqual({
      quantity: 2.5,
      unitPrice: 45,
    });
  });

  it('does not silently accept incompatible units or invalid conversion factors', () => {
    expect(convertInvoiceLineToPurchaseUnit(2, 45, 'piece', item)).toBeNull();
    expect(convertInvoiceLineToPurchaseUnit(2, 45, 'g', { ...item, conversionFactor: 0 })).toBeNull();
    expect(convertInvoiceLineToPurchaseUnit(0, 45, 'kg', item)).toBeNull();
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
