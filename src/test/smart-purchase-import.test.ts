import { describe, expect, it } from 'vitest';
import { parseSmartPurchaseMessage } from '@/lib/smartPurchaseImport';

const inventoryItems = [
  { id: 'tomato', name: 'طماطم', sku: 'VEG-01' },
  { id: 'rice', name: 'Rice', sku: 'DRY-02' },
];

describe('smart purchase message parsing', () => {
  it('extracts Arabic lines, Arabic numerals, units, and supplier', () => {
    const result = parseSmartPurchaseMessage(
      'المورد: مورد الخضار\nطماطم ٥ كجم × ٣٠\nالإجمالي: 150',
      inventoryItems,
    );

    expect(result.supplierName).toBe('مورد الخضار');
    expect(result.lines).toEqual([
      expect.objectContaining({
        sourceName: 'طماطم',
        itemId: 'tomato',
        quantity: 5,
        unitPrice: 30,
        sourceUnit: 'kg',
      }),
    ]);
    expect(result.ignoredLines).toEqual([]);
  });

  it('matches exact stock names only and returns unparsed rows for review', () => {
    const result = parseSmartPurchaseMessage(
      'Rice 2 bag x 125\nRice flour 1 bag x 80\nنص غير معروف',
      inventoryItems,
    );

    expect(result.lines.map((line) => line.itemId)).toEqual(['rice', '']);
    expect(result.lines[0].sourceUnit).toBe('bag');
    expect(result.ignoredLines).toContain('نص غير معروف');
  });

  it('supports quantities with decimals and unitless WhatsApp rows', () => {
    const result = parseSmartPurchaseMessage('طماطم ٢٫٥ × ١٢٫٥', inventoryItems);

    expect(result.lines[0]).toMatchObject({ quantity: 2.5, unitPrice: 12.5, sourceUnit: null });
  });

  it('fuzzy-matches invoice typos with reduced confidence for manual review', () => {
    const result = parseSmartPurchaseMessage('طماطمم 5 kg x 30', inventoryItems);

    expect(result.lines[0].itemId).toBe('tomato');
    expect(result.lines[0].matchConfidence).toBeLessThan(1);
  });

  it('does not collapse a longer invoice name into a shorter different item', () => {
    const result = parseSmartPurchaseMessage('Rice flour 1 bag x 80', inventoryItems);

    expect(result.lines[0].itemId).toBe('');
  });

  it('marks exact matches with full confidence', () => {
    const result = parseSmartPurchaseMessage('طماطم 5 kg x 30', inventoryItems);

    expect(result.lines[0].itemId).toBe('tomato');
    expect(result.lines[0].matchConfidence).toBe(1);
  });
});
