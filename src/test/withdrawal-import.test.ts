import { describe, expect, it } from 'vitest';
import { parseWithdrawalSheetText } from '@/lib/withdrawalImport';

const items = [
  { id: 'tomato', name: 'طماطم', sku: 'VEG-01' },
  { id: 'onion', name: 'بصل', sku: 'VEG-02' },
  { id: 'chicken', name: 'فراخ', sku: 'CH-01' },
  { id: 'rice', name: 'Rice', sku: 'DRY-02' },
];

describe('withdrawal sheet text parsing', () => {
  it('parses simple lines with units and matches items', () => {
    const result = parseWithdrawalSheetText('طماطم 5 كجم\nبصل 3 كجم', items);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ sourceName: 'طماطم', itemId: 'tomato', quantity: 5, sourceUnit: 'kg', remainingQuantity: null });
    expect(result.lines[1]).toMatchObject({ itemId: 'onion', quantity: 3 });
    expect(result.ignoredLines).toEqual([]);
  });

  it('extracts the remaining quantity with Arabic and English markers', () => {
    const result = parseWithdrawalSheetText('طماطم 5 كجم متبقي 10\nفراخ 2 - الباقي 8\nRice 2 kg remaining 20', items);

    expect(result.lines[0]).toMatchObject({ itemId: 'tomato', quantity: 5, remainingQuantity: 10 });
    expect(result.lines[1]).toMatchObject({ itemId: 'chicken', quantity: 2, remainingQuantity: 8 });
    expect(result.lines[2]).toMatchObject({ itemId: 'rice', quantity: 2, remainingQuantity: 20 });
  });

  it('handles Arabic digits, colon separators, and comma separators', () => {
    const result = parseWithdrawalSheetText('بصل: ٣، الباقي: ١٠', items);

    expect(result.lines[0]).toMatchObject({ itemId: 'onion', quantity: 3, remainingQuantity: 10 });
  });

  it('skips sheet headers and totals instead of treating them as items', () => {
    const result = parseWithdrawalSheetText('مسحوبات اليوم\nالتاريخ: 2026-11-08\nطماطم 5 كجم\nالإجمالي: 5', items);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].itemId).toBe('tomato');
  });

  it('keeps unmatched lines for manual review instead of dropping them', () => {
    const result = parseWithdrawalSheetText('صنف غير معروف 4 كجم', items);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].itemId).toBe('');
    expect(result.lines[0].matchConfidence).toBe(0);
  });

  it('ignores rows without a valid positive quantity', () => {
    const result = parseWithdrawalSheetText('ملاحظة بدون كمية', items);

    expect(result.lines).toHaveLength(0);
    expect(result.ignoredLines).toContain('ملاحظة بدون كمية');
  });

  it('parses photographed/handwritten WithdrawalSheetPrintSheet table rows (serial + item + unit + qty + remaining) and skips blank form rows', () => {
    const ocrSheetText = [
      'ورقة مسحوبات',
      'المخزن المركزي — السبت 14 نوفمبر 2026',
      'أمين المخزن (المسلّم): ............',
      'م | اسم الصنف | الوحدة | الكمية المسحوبة | الرصيد الفعلي المتبقي | ملاحظات',
      '1 | الطماطم | كجم | 5 | 10',
      '2 بصل كجم 3',
      '3 دجاج 4 12',
      '4 ............',
      'توقيع مسؤول المخزن',
    ].join('\n');

    const result = parseWithdrawalSheetText(ocrSheetText, items);

    expect(result.ignoredLines).toEqual([]);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toMatchObject({ itemId: 'tomato', quantity: 5, remainingQuantity: 10, sourceUnit: 'kg' });
    expect(result.lines[1]).toMatchObject({ itemId: 'onion', quantity: 3, remainingQuantity: null, sourceUnit: 'kg' });
    expect(result.lines[2]).toMatchObject({ itemId: 'chicken', quantity: 4, remainingQuantity: 12 });
  });

  it('parses leading quantities and colloquial fractions in withdrawal messages', () => {
    const result = parseWithdrawalSheetText('سحب 2 و نص كجم طماطم متبقي 7.5\nنص كيلو بصل', items);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ itemId: 'tomato', quantity: 2.5, remainingQuantity: 7.5, sourceUnit: 'kg' });
    expect(result.lines[1]).toMatchObject({ itemId: 'onion', quantity: 0.5, sourceUnit: 'kg' });
  });
});
