import { describe, expect, it } from 'vitest';
import { buildKitchenStickers, KitchenDailySummary } from '@/lib/kitchen';
import { Meal } from '@/types/menu';

const meals: Meal[] = [
  {
    id: 'meal-1',
    brand_id: 'brand-1',
    name: 'بيف استيك',
    category: 'meat',
    price: 200,
    protein: 42,
    carbs: 18,
    fat: 10,
    calories: 360,
    created_at: '2026-03-20T09:00:00.000Z',
    updated_at: '2026-03-20T09:00:00.000Z',
  },
];

const summary: KitchenDailySummary = {
  date: '2026-03-22',
  isCombinedView: false,
  orderCount: 2,
  totalMealCount: 3,
  totalDistinctMeals: 1,
  brands: [
    {
      key: 'brand-1',
      brandId: 'brand-1',
      brandName: 'Healthy Food',
      orderCount: 2,
      totalMealCount: 3,
      meals: [
        {
          key: 'meal-1',
          label: 'بيف استيك',
          category: 'meat',
          count: 3,
          modifications: [
            {
              key: 'meal-1-no-rice',
              label: 'بيف استيك - بدون رز',
              instruction: 'بدون رز',
              count: 1,
            },
          ],
        },
      ],
    },
  ],
};

describe('buildKitchenStickers', () => {
  it('creates one sticker per meal quantity and includes modified labels separately', () => {
    const stickers = buildKitchenStickers(summary, meals);

    expect(stickers).toHaveLength(3);
    expect(stickers.filter(sticker => sticker.label === 'بيف استيك')).toHaveLength(2);
    expect(stickers.filter(sticker => sticker.label === 'بيف استيك - بدون رز')).toHaveLength(1);
    expect(stickers.every(sticker => sticker.calories === 360)).toBe(true);
    expect(stickers.every(sticker => sticker.protein === 42)).toBe(true);
  });
});