import { describe, expect, it } from 'vitest';
import { cell, consolidateRows, createImportedOrderNumber, normalizeImportedPhone, parseImportedAmount, parsePastedOrder } from '@/components/OrderSheetImportDialog';

describe('order sheet import parsing', () => {
  it('recognizes the Arabic headers used by exported order sheets', () => {
    const row = { الاسم: 'محمد', 'التلفون ': 1000252654, الاوردر: 'باكدج', التفاصيل: 'وجبة 1' };

    expect(cell(row, ['التلفون', 'الهاتف'])).toBe(1000252654);
    expect(cell(row, ['الاوردر', 'رقم الطلب'])).toBe('باكدج');
    expect(consolidateRows([row, { التفاصيل: 'وجبة 2' }])).toHaveLength(1);
  });

  it('restores the leading zero when Excel stores an Egyptian mobile as a number', () => {
    expect(normalizeImportedPhone(1000252654)).toBe('01000252654');
    expect(normalizeImportedPhone('01271320535')).toBe('01271320535');
    expect(normalizeImportedPhone('+20 1000252654')).toBe('01000252654');
    expect(normalizeImportedPhone('0020 1000252654')).toBe('01000252654');
  });

  it('does not reuse a repeated package label as the order number', () => {
    const used = new Set<string>();
    const first = createImportedOrderNumber('باكدج ٦وجبات', 'باكدج ٦وجبات', used, 1);
    const second = createImportedOrderNumber('باكدج ٦وجبات', 'باكدج ٦وجبات', used, 2);

    expect(first).toMatch(/^IMP-/);
    expect(second).toMatch(/^IMP-/);
    expect(second).not.toBe(first);
  });

  it('extracts customer and order fields from a pasted WhatsApp-style message', () => {
    const parsed = parsePastedOrder([
      'اسم العميل: أحمد محمد',
      'رقم الهاتف: ٠١٠٠٠٢٥٢٦٥٤',
      'العنوان: مدينة نصر - شارع الطيران',
      'الطلب: وجبة فراخ + أرز',
      'السعر: ٢٥٠ جنيه',
    ].join('\n'));

    expect(parsed).toMatchObject({
      'اسم العميل': 'أحمد محمد',
      الهاتف: '01000252654',
      العنوان: 'مدينة نصر - شارع الطيران',
      التفاصيل: 'وجبة فراخ + أرز',
      السعر: '250 جنيه',
    });
  });

  it('extracts an Egyptian phone from unlabelled message text and parses Arabic currency values', () => {
    const parsed = parsePastedOrder('طلب جديد للعميل\nللتواصل 01012345678');

    expect(parsed?.الهاتف).toBe('01012345678');
    expect(parseImportedAmount('١٬٢٥٠٫٥٠ جنيه')).toBe(1250.5);
  });
});
