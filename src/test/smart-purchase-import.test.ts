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

  it('parses free-form Arabic purchase sentences with explicit unit price and fraction', () => {
    const result = parseSmartPurchaseMessage(
      'اشتريت ٣ جرجير تمن ال ٣ ١ جنيه يعني سعر الواحده ٣ جنيه و نص تقريبا',
      inventoryItems,
    );

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ sourceName: 'جرجير', quantity: 3, unitPrice: 3.5 });
    expect(result.ignoredLines).toEqual([]);
  });

  it('parses free-form lines with piece counts and per-piece price', () => {
    const result = parseSmartPurchaseMessage(
      'اشتريت كابوتشا ١٢ واحده بسعر ١١ جنيه ليهم كلهم يعني سعر الواحده ٩ جنيه تقريبا',
      inventoryItems,
    );

    expect(result.lines[0]).toMatchObject({ sourceName: 'كابوتشا', quantity: 12, unitPrice: 9, sourceUnit: 'piece' });
  });

  it('derives the unit price from the total when only the total is mentioned, and captures the supplier', () => {
    const result = parseSmartPurchaseMessage(
      'اشتريت كزبرة مشموم من حسن الكزبرون سعرها بيكون ٢٥ فيها ١٠ اطباق',
      inventoryItems,
    );

    expect(result.lines[0]).toMatchObject({ sourceName: 'كزبرة مشموم', quantity: 10, unitPrice: 2.5, sourceUnit: 'piece' });
    expect(result.supplierName).toBe('حسن الكزبرون');
  });

  it('parses a bare line that only mentions the per-unit price', () => {
    const result = parseSmartPurchaseMessage('مشموم يعني سعر الطبق ٢٥ جنيه', inventoryItems);

    expect(result.lines[0]).toMatchObject({ sourceName: 'مشموم', quantity: 1, unitPrice: 25 });
  });

  it('parses a full free-form supplier message end to end', () => {
    const result = parseSmartPurchaseMessage([
      'اشتريت ٣ جرجير تمن ال ٣ ١ جنيه يعني سعر الواحده ٣ جنيه و نص تقريبا',
      'اشتريت كابوتشا ١٢ واحده بسعر ١١ جنيه ليهم كلهم يعني سعر الواحده ٩ جنيه تقريبا',
      'اشتريت كزبرة مشموم من حسن الكزبرون سعرها بيكون ٢٥ فيها ١٠ اطباق',
      'مشموم يعني سعر الطبق ٢٥ جنيه',
    ].join('\n'), inventoryItems);

    expect(result.lines).toHaveLength(4);
    expect(result.ignoredLines).toEqual([]);
    expect(result.supplierName).toBe('حسن الكزبرون');
  });

  it('supports Arabic word quantities and the "ب" price marker', () => {
    const result = parseSmartPurchaseMessage('اشتريت اتنين كيلو طماطم ب ٤٠ جنيه', inventoryItems);

    expect(result.lines[0]).toMatchObject({ sourceName: 'طماطم', quantity: 2, unitPrice: 20, sourceUnit: 'kg' });
    expect(result.lines[0].itemId).toBe('tomato');
  });
});
