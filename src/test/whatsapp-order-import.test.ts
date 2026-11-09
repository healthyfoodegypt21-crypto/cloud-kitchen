import { describe, expect, it } from 'vitest';
import { parseWhatsAppOrder } from '@/lib/whatsappOrderImport';
import { parsePastedOrder } from '@/components/OrderSheetImportDialog';

const REAL_MESSAGE = [
  'نهى احمد',
  ' 01132331602',
  'مريوطيه فيصل ',
  ' 32 شارع محمود عارف متفرع من شارع الشيشيني عماره المدينه المنوره الدور الثاني شقه امام الاسانسير بجوار صيدلية د نادر محمد',
  'الاوردر / باكدج ٦وجبات ',
  '1 Beef Shawarma ',
  '1 Russian Beef ',
  '1 cordon blue ',
  '1 BBQ ',
  '1 sweet and sour ',
  '1 chicken piccata ',
  '1 Fruit Salad ',
  'قيمه الاوردر/ 1400',
  'توصيل / 0',
].join('\n');

describe('WhatsApp free-form order parsing', () => {
  it('detects every field from the real WhatsApp order message', () => {
    const parsed = parseWhatsAppOrder(REAL_MESSAGE);

    expect(parsed).toMatchObject({
      'اسم العميل': 'نهى احمد',
      'الهاتف': '01132331602',
      'المنطقة': 'مريوطيه فيصل',
      'العنوان': '32 شارع محمود عارف متفرع من شارع الشيشيني عماره المدينه المنوره الدور الثاني شقه امام الاسانسير بجوار صيدلية د نادر محمد',
      'الباقة': 'باكدج 6وجبات',
      'المبلغ': '1400',
      'التوصيل': '0',
    });
    expect(parsed?.['التفاصيل']).toBe('Beef Shawarma، Russian Beef، cordon blue، BBQ، sweet and sour، chicken piccata، Fruit Salad');
  });

  it('expands meal quantities into repeated entries', () => {
    const parsed = parseWhatsAppOrder('أحمد\n01012345678\nالاوردر: وجبات من المنيو\n2 شيش طاووق\n1 سلطة');

    expect(parsed?.['التفاصيل']).toBe('شيش طاووق، شيش طاووق، سلطة');
  });

  it('does not mistake an address starting with a building number for a meal line', () => {
    const parsed = parseWhatsAppOrder('أحمد\n01012345678\n32 شارع التحرير الدور الثاني\nالاوردر: باكدج\n1 فراخ');

    expect(parsed?.['العنوان']).toBe('32 شارع التحرير الدور الثاني');
    expect(parsed?.['التفاصيل']).toBe('فراخ');
  });

  it('splits a name and phone sharing the same line and captures a second phone', () => {
    const parsed = parseWhatsAppOrder('نهى احمد 01132331602\n01098765432\nمريوطيه فيصل\n1 فراخ مشوية');

    expect(parsed?.['اسم العميل']).toBe('نهى احمد');
    expect(parsed?.['الهاتف']).toBe('01132331602');
    expect(parsed?.['هاتف بديل']).toBe('01098765432');
    expect(parsed?.['المنطقة']).toBe('مريوطيه فيصل');
  });

  it('keeps labeled messages on the existing parser path', () => {
    const parsed = parsePastedOrder('اسم العميل: أحمد محمد\nرقم الهاتف: 01012345678\nالعنوان: مدينة نصر\nالطلب: وجبة فراخ + أرز\nالسعر: 250');

    expect(parsed).toMatchObject({
      'اسم العميل': 'أحمد محمد',
      الهاتف: '01012345678',
      العنوان: 'مدينة نصر',
      التفاصيل: 'وجبة فراخ + أرز',
      السعر: '250',
    });
    expect(parsed?.['الباقة']).toBeUndefined();
  });

  it('routes the real free-form message through parsePastedOrder too', () => {
    const parsed = parsePastedOrder(REAL_MESSAGE);

    expect(parsed).toMatchObject({
      'اسم العميل': 'نهى احمد',
      'الهاتف': '01132331602',
      'الباقة': 'باكدج 6وجبات',
      'المبلغ': '1400',
    });
    expect(parsed?.['التفاصيل']).toContain('Beef Shawarma');
  });
});
