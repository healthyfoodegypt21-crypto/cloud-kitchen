import { describe, expect, it } from 'vitest';
import { buildOrderLocationUrl, buildOrderNotesWithMetadata, extractLegacyOrderMetadata, normalizePhone, parseDetailedAddress } from '@/lib/utils';

describe('customer utils', () => {
  it('normalizes phone digits only', () => {
    expect(normalizePhone('0100 123-4567')).toBe('01001234567');
  });

  it('extracts legacy metadata from notes', () => {
    expect(extractLegacyOrderMetadata('ملاحظة مهمة\nرقم بديل: 0111222333\nتاريخ التنفيذ: 2026-03-22')).toEqual({
      notes: 'ملاحظة مهمة',
      phoneSecondary: '0111222333',
      executionDate: '2026-03-22',
      locationLink: '',
      mealCustomizations: [],
      packageMealSnapshot: [],
    });
  });

  it('serializes and extracts per-meal customizations in legacy order notes', () => {
    const serialized = buildOrderNotesWithMetadata({
      notes: 'بدون ملح',
      mealCustomizations: [
        { key: 'meal-1', label: 'ستيك مشروم', notes: 'بدون رز' },
      ],
    });

    expect(extractLegacyOrderMetadata(serialized)).toEqual({
      notes: 'بدون ملح',
      phoneSecondary: '',
      executionDate: '',
      locationLink: '',
      mealCustomizations: [
        { key: 'meal-1', label: 'ستيك مشروم', notes: 'بدون رز' },
      ],
      packageMealSnapshot: [],
    });
  });

  it('parses structured address parts', () => {
    expect(parseDetailedAddress('بيت 15 - شارع النصر - منطقة مدينة نصر - الدور 3 - شقة 12')).toEqual({
      address_house_number: '15',
      address_street: 'النصر',
      address_area: 'مدينة نصر',
      address_floor: '3',
      address_apartment: '12',
    });
  });

  it('builds a search url from detailed address parts when no exact location link exists', () => {
    expect(buildOrderLocationUrl({
      address_house_number: '15',
      address_street: 'النصر',
      address_area: 'مدينة نصر',
      address: 'بيت 15 - شارع النصر - منطقة مدينة نصر - الدور 3 - شقة 12',
    })).toBe('https://www.google.com/maps/search/?api=1&query=%D8%A8%D9%8A%D8%AA%2015%D8%8C%20%D8%B4%D8%A7%D8%B1%D8%B9%20%D8%A7%D9%84%D9%86%D8%B5%D8%B1%D8%8C%20%D9%85%D9%86%D8%B7%D9%82%D8%A9%20%D9%85%D8%AF%D9%8A%D9%86%D8%A9%20%D9%86%D8%B5%D8%B1%D8%8C%20%D9%85%D8%B5%D8%B1');
  });

  it('prefers the exact location link over derived address directions', () => {
    expect(buildOrderLocationUrl({
      location_link: 'https://maps.app.goo.gl/abc123',
      address_house_number: '15',
      address_street: 'النصر',
      address_area: 'مدينة نصر',
    })).toBe('https://maps.app.goo.gl/abc123');
  });
});