import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteLocalInventoryItem,
  getInventoryStatus,
  getLocalInventoryItems,
  seedLocalInventoryForBrand,
  summarizeInventoryByCategory,
  upsertLocalInventoryItem,
} from '@/store/inventory';

describe('inventory store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('classifies stock health based on quantity and reorder point', () => {
    expect(getInventoryStatus({ quantity: 12, reorder_point: 10 })).toBe('healthy');
    expect(getInventoryStatus({ quantity: 8, reorder_point: 10 })).toBe('low');
    expect(getInventoryStatus({ quantity: 4, reorder_point: 10 })).toBe('critical');
    expect(getInventoryStatus({ quantity: 0, reorder_point: 10 })).toBe('out');
  });

  it('seeds one brand only once and preserves CRUD operations', () => {
    const seeded = seedLocalInventoryForBrand('brand-1');

    expect(seeded.length).toBeGreaterThan(0);
    expect(seedLocalInventoryForBrand('brand-1')).toHaveLength(seeded.length);

    const created = upsertLocalInventoryItem({
      brand_id: 'brand-1',
      name: 'صدور ديك رومي',
      sku: 'TRK-BRST',
      category: 'protein',
      unit: 'kg',
      quantity: 5,
      reorder_point: 3,
      cost_per_unit: 210,
      supplier_name: 'مورد خاص',
      storage_location: 'فريزر 3',
      notes: 'اختبار',
    });

    const createdItem = created.find((item) => item.sku === 'TRK-BRST');
    expect(createdItem).toBeTruthy();

    const updated = upsertLocalInventoryItem({
      id: createdItem?.id,
      brand_id: 'brand-1',
      name: 'صدور ديك رومي',
      sku: 'TRK-BRST',
      category: 'protein',
      unit: 'kg',
      quantity: 2,
      reorder_point: 3,
      cost_per_unit: 215,
      supplier_name: 'مورد خاص',
      storage_location: 'فريزر 3',
      notes: 'تم التحديث',
    });

    const updatedItem = updated.find((item) => item.id === createdItem?.id);
    expect(updatedItem?.quantity).toBe(2);
    expect(updatedItem?.cost_per_unit).toBe(215);

    const afterDelete = deleteLocalInventoryItem(createdItem?.id ?? '');
    expect(afterDelete.find((item) => item.id === createdItem?.id)).toBeUndefined();
  });

  it('summarizes categories from the current inventory', () => {
    seedLocalInventoryForBrand('brand-1');
    const summary = summarizeInventoryByCategory(getLocalInventoryItems());

    expect(summary.protein).toBeGreaterThan(0);
    expect(summary.packaging).toBeGreaterThan(0);
    expect(summary.sauce).toBeGreaterThan(0);
  });
});