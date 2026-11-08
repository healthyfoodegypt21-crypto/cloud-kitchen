import { describe, expect, it } from 'vitest';
import { cell, consolidateRows, normalizeImportedPhone, parseImportedAmount, parsePastedOrder } from '@/components/OrderSheetImportDialog';
import { getImportedOrderNumber, getOrderImportFingerprint, hasDuplicateOrderImport } from '@/lib/orderImport';
import { buildOrderNotesWithMetadata } from '@/lib/utils';
import type { Order } from '@/types/order';

function createImportedOrder(overrides: Partial<Order> = {}): Omit<Order, 'id' | 'created_at'> {
  return {
    order_number: '',
    customer_name: 'أحمد محمد',
    phone: '01012345678',
    phone_secondary: '',
    location_link: '',
    address: 'مدينة نصر',
    address_house_number: '',
    address_street: '',
    address_area: '',
    address_floor: '',
    address_apartment: '',
    execution_date: '2026-11-09',
    order_mode: 'meals',
    package: '',
    package_plan_id: null,
    meal_type: 'lunch',
    notes: '',
    status: 'new',
    price: 250,
    selected_meal_ids: ['meal-1'],
    source: 'other',
    brand_id: 'brand-1',
    created_by: null,
    ...overrides,
  };
}

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

  it('generates stable deduplication keys scoped to brand and execution date', () => {
    const order = createImportedOrder();

    expect(getImportedOrderNumber(order)).toMatch(/^IMP-[0-9a-f]{16}$/);
    expect(getImportedOrderNumber(order)).toBe(getImportedOrderNumber(order));
    expect(getImportedOrderNumber({ ...order, order_number: 'SRC-001' })).toBe(getImportedOrderNumber({ ...order, order_number: 'SRC-001' }));
    expect(getImportedOrderNumber({ ...order, order_number: 'SRC-001' })).toContain('SRC-001');
    expect(getImportedOrderNumber({ ...order, brand_id: 'brand-2' })).not.toBe(getImportedOrderNumber(order));
    expect(getImportedOrderNumber({ ...order, execution_date: '2026-11-10' })).not.toBe(getImportedOrderNumber(order));
    expect(getOrderImportFingerprint({ ...order, selected_meal_ids: ['meal-2', 'meal-1'] }))
      .toBe(getOrderImportFingerprint({ ...order, selected_meal_ids: ['meal-1', 'meal-2'] }));
    expect(getOrderImportFingerprint({ ...order, selected_meal_ids: ['meal-2'] }))
      .not.toBe(getOrderImportFingerprint(order));
  });

  it('recognizes old duplicate imports but keeps the same customer separate across brands or different orders', () => {
    const imported = createImportedOrder();
    const previouslyImported = {
      ...imported,
      order_number: 'old-random-number',
      notes: buildOrderNotesWithMetadata({
        notes: imported.notes,
        executionDate: imported.execution_date,
        phoneSecondary: imported.phone_secondary,
        locationLink: imported.location_link,
      }),
    };

    expect(hasDuplicateOrderImport(imported, [previouslyImported])).toBe(true);
    expect(hasDuplicateOrderImport(imported, [{ ...previouslyImported, brand_id: 'brand-2' }])).toBe(false);
    expect(hasDuplicateOrderImport(imported, [{ ...previouslyImported, selected_meal_ids: ['meal-2'] }])).toBe(false);
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
