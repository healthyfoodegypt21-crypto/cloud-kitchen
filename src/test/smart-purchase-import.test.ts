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

  it('computes the unit price from the total when the text only mentions the total', () => {
    const result = parseSmartPurchaseMessage('اشتريت ٤ كيلو بصل تمنهم ١٠٠ جنيه', inventoryItems);

    expect(result.lines[0]).toMatchObject({ sourceName: 'بصل', quantity: 4, unitPrice: 25, sourceUnit: 'kg' });
  });

  it('computes the unit price from a "ب" total with a fraction', () => {
    const result = parseSmartPurchaseMessage('اشتريت ٢ كيلو طماطم ب ٥٠ جنيه و نص', inventoryItems);

    expect(result.lines[0]).toMatchObject({ sourceName: 'طماطم', quantity: 2, unitPrice: 25.25 });
  });

  it('distinguishes per-unit price ("الكيلو ب 30") from total price ("ب 150") without dividing twice', () => {
    const perUnit = parseSmartPurchaseMessage('5 كيلو طماطم الكيلو ب 30 جنيه', inventoryItems);
    const fromTotal = parseSmartPurchaseMessage('5 كيلو طماطم ب 150 جنيه', inventoryItems);

    expect(perUnit.lines[0]).toMatchObject({ itemId: 'tomato', quantity: 5, unitPrice: 30, sourceUnit: 'kg' });
    expect(fromTotal.lines[0]).toMatchObject({ itemId: 'tomato', quantity: 5, unitPrice: 30, sourceUnit: 'kg' });
  });

  it('parses colloquial fractions ("نص كيلو"), implicit-1 units ("كيلو طماطم"), and definite article matching ("الطماطم")', () => {
    const result = parseSmartPurchaseMessage(
      'نص كيلو ثوم ب 40 جنيه\nكيلو الطماطم ب 25 جنيه\n2 كيلو ونص بصل ب 50 جنيه',
      inventoryItems,
    );

    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toMatchObject({ sourceName: 'ثوم', quantity: 0.5, unitPrice: 80, sourceUnit: 'kg' });
    expect(result.lines[1]).toMatchObject({ itemId: 'tomato', quantity: 1, unitPrice: 25, sourceUnit: 'kg' });
    expect(result.lines[2]).toMatchObject({ sourceName: 'بصل', quantity: 2.5, unitPrice: 20, sourceUnit: 'kg' });
  });

  it('parses structured invoice table rows (LTR, RTL OCR, pipe-delimited) and extracts invoice metadata', () => {
    const result = parseSmartPurchaseMessage(
      [
        'المورد: أولاد رجب للتوريدات',
        'رقم الفاتورة: INV-2026-88',
        'التاريخ: 14/11/2026',
        'الخصم: 25',
        'الضريبة: 15',
        'الدفع: انستاباي',
        '1 | طماطم | كجم | 5 | 30 | 150',
        '200 100 2 bag Rice',
      ].join('\n'),
      inventoryItems,
    );

    expect(result).toMatchObject({
      supplierName: 'أولاد رجب للتوريدات',
      invoiceNumber: 'INV-2026-88',
      invoiceDate: '2026-11-14',
      discountAmount: 25,
      taxAmount: 15,
      paymentMethod: 'bank_transfer',
    });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ itemId: 'tomato', quantity: 5, unitPrice: 30, sourceUnit: 'kg' });
    expect(result.lines[1]).toMatchObject({ itemId: 'rice', quantity: 2, unitPrice: 100, sourceUnit: 'bag' });
    expect(result.ignoredLines).toEqual([]);
  });

  it('splits multi-item single-line comma-separated purchase messages', () => {
    const result = parseSmartPurchaseMessage('طماطم 5 كجم × 30، بصل 4 كجم × 25', inventoryItems);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ itemId: 'tomato', quantity: 5, unitPrice: 30 });
    expect(result.lines[1]).toMatchObject({ sourceName: 'بصل', quantity: 4, unitPrice: 25 });
  });
});
