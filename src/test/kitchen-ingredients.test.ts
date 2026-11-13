import { describe, expect, it } from 'vitest';
import {
  aggregateKitchenIngredients,
  parseSmartInstructionClauses,
} from '@/lib/kitchenIngredients';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

const brands = [
  { id: 'brand-hf', name: 'Healthy Food', color: '#10b981' },
  { id: 'brand-pb', name: 'Protein Box', color: '#3b82f6' },
];

const catalogMeals: Meal[] = [
  {
    id: 'meal-steak',
    brand_id: 'brand-hf',
    name: 'Beef Steak',
    category: 'meat',
    price: 300,
    protein: 42,
    carbs: 60,
    fat: 15,
    calories: 550,
    ingredients: [
      { name: 'ارز', weight_before_grams: 60, weight_after_grams: 150 },
      { name: 'خضار', weight_before_grams: 130, weight_after_grams: 100 },
      { name: 'استيك', weight_before_grams: 200, weight_after_grams: 125 },
    ],
    created_at: '',
    updated_at: '',
  },
  {
    id: 'meal-chicken',
    brand_id: 'brand-hf',
    name: 'Chicken Teriyaki',
    category: 'chicken',
    price: 250,
    protein: 38,
    carbs: 62,
    fat: 12,
    calories: 510,
    ingredients: [
      { name: 'أرز بسمتي', weight_before_grams: 60, weight_after_grams: 150 },
      { name: 'خضار', weight_before_grams: 130, weight_after_grams: 100 },
      { name: 'صدور دجاج كامله', weight_before_grams: 200, weight_after_grams: 125 },
    ],
    created_at: '',
    updated_at: '',
  },
  {
    id: 'meal-pb-shawarma',
    brand_id: 'brand-pb',
    name: 'Beef Shawarma',
    category: 'meat',
    price: 200,
    protein: 42,
    carbs: 70,
    fat: 18,
    calories: 600,
    ingredients: [
      { name: 'ارز', weight_before_grams: 60, weight_after_grams: 150 },
      { name: 'بطاطس ويدجيز', weight_before_grams: 180, weight_after_grams: 150 },
      { name: 'شرائح لحم', weight_before_grams: 200, weight_after_grams: 125 },
    ],
    created_at: '',
    updated_at: '',
  },
];

const emptyPackages: PackagePlan[] = [];

function makeOrder(partial: Partial<Order> & { id: string }): Order {
  return {
    order_number: `ORD-${partial.id}`,
    customer_name: 'عميل',
    phone: '01000000000',
    phone_secondary: '',
    address: 'القاهرة',
    address_house_number: '',
    address_street: '',
    address_area: '',
    address_floor: '',
    address_apartment: '',
    execution_date: '2026-11-14',
    order_mode: 'meals',
    package: '',
    package_plan_id: null,
    meal_type: 'lunch',
    notes: '',
    status: 'confirmed',
    created_at: '2026-11-13T10:00:00.000Z',
    price: 300,
    selected_meal_ids: [],
    source: 'other',
    brand_id: 'brand-hf',
    created_by: null,
    ...partial,
  };
}

describe('kitchenIngredients smart engine', () => {
  it('aggregates shared ingredients per brand and across all companies with pre/post cooking weights', () => {
    const orders: Order[] = [
      makeOrder({
        id: '1',
        brand_id: 'brand-hf',
        selected_meal_ids: ['meal-steak', 'meal-chicken'],
      }),
      makeOrder({
        id: '2',
        brand_id: 'brand-pb',
        selected_meal_ids: ['meal-pb-shawarma'],
      }),
    ];

    const report = aggregateKitchenIngredients({
      orders,
      brands,
      meals: catalogMeals,
      packages: emptyPackages,
      date: '2026-11-14',
    });

    const combinedRice = report.combined.items.find((i) => i.key === 'rice');
    expect(combinedRice).toBeDefined();
    expect(combinedRice?.portionCount).toBe(3);
    expect(combinedRice?.weightBeforeGrams).toBe(180);
    expect(combinedRice?.weightAfterGrams).toBe(450);

    // Per-brand split inside combined AND standalone byBrand summaries
    expect(combinedRice?.byBrand['brand-hf']?.portionCount).toBe(2);
    expect(combinedRice?.byBrand['brand-pb']?.portionCount).toBe(1);

    const hfRice = report.byBrand['brand-hf'].items.find((i) => i.key === 'rice');
    const pbRice = report.byBrand['brand-pb'].items.find((i) => i.key === 'rice');
    expect(hfRice?.portionCount).toBe(2);
    expect(hfRice?.weightBeforeGrams).toBe(120);
    expect(hfRice?.weightAfterGrams).toBe(300);
    expect(pbRice?.portionCount).toBe(1);
    expect(pbRice?.weightBeforeGrams).toBe(60);
    expect(pbRice?.weightAfterGrams).toBe(150);
  });

  it('deducts excluded ingredients when customer writes "بدون ارز" or "من غير رز" or "زيرو كارب"', () => {
    const orders: Order[] = [
      makeOrder({
        id: '1',
        brand_id: 'brand-hf',
        selected_meal_ids: ['meal-steak', 'meal-chicken'],
        meal_customizations: [
          { key: 'meal-steak', label: 'Beef Steak', notes: 'بدون ارز' },
        ],
      }),
      makeOrder({
        id: '2',
        brand_id: 'brand-pb',
        selected_meal_ids: ['meal-pb-shawarma'],
        notes: 'زيرو كارب',
      }),
    ];

    const report = aggregateKitchenIngredients({
      orders,
      brands,
      meals: catalogMeals,
      packages: emptyPackages,
      date: '2026-11-14',
    });

    // Rice was in all 3 meals originally, removed from Beef Steak ("بدون ارز") and Beef Shawarma ("زيرو كارب") -> net 1 portion!
    const combinedRice = report.combined.items.find((i) => i.key === 'rice');
    expect(combinedRice?.basePortionCount).toBe(3);
    expect(combinedRice?.removedPortionCount).toBe(2);
    expect(combinedRice?.portionCount).toBe(1);
    expect(combinedRice?.weightBeforeGrams).toBe(60);
    expect(combinedRice?.weightAfterGrams).toBe(150);

    // Potato wedges on Beef Shawarma was also removed by "زيرو كارب", while Beef Strips protein remained!
    const wedges = report.combined.items.find((i) => i.key === 'potato_wedges');
    expect(wedges?.portionCount).toBe(0);
    expect(wedges?.removedPortionCount).toBe(1);

    const beefStrips = report.combined.items.find((i) => i.key === 'beef_strips');
    expect(beefStrips?.portionCount).toBe(1);
    expect(beefStrips?.weightBeforeGrams).toBe(200);
    expect(beefStrips?.weightAfterGrams).toBe(125);
  });

  it('handles ingredient substitutions such as "استبدال الخضار ببطاطس ويدجيز" and "بدل الارز مكرونة" accurately', () => {
    const orders: Order[] = [
      makeOrder({
        id: 'sub-1',
        brand_id: 'brand-hf',
        selected_meal_ids: ['meal-steak', 'meal-chicken'],
        meal_customizations: [
          {
            key: 'meal-steak',
            label: 'Beef Steak',
            notes: 'استبدال الخضار ببطاطس ويدجيز',
          },
          {
            key: 'meal-chicken',
            label: 'Chicken Teriyaki',
            notes: 'استبدال ارز بسمتي بمكرونة فيتوتشيني',
          },
        ],
      }),
    ];

    const report = aggregateKitchenIngredients({
      orders,
      brands,
      meals: catalogMeals,
      packages: emptyPackages,
      date: '2026-11-14',
    });

    const veggies = report.combined.items.find((i) => i.key === 'vegetables');
    const wedges = report.combined.items.find((i) => i.key === 'potato_wedges');
    const rice = report.combined.items.find((i) => i.key === 'rice');
    const fettuccine = report.combined.items.find((i) => i.key === 'pasta_fettuccine');

    // Veggies: started at 2, 1 replaced by potato wedges -> net 1
    expect(veggies?.basePortionCount).toBe(2);
    expect(veggies?.removedPortionCount).toBe(1);
    expect(veggies?.portionCount).toBe(1);
    expect(veggies?.weightBeforeGrams).toBe(130);
    expect(veggies?.weightAfterGrams).toBe(100);

    // Potato wedges: 0 base in brand-hf order + 1 added by substitution (180g raw -> 150g cooked)
    expect(wedges?.addedBySubstitutionCount).toBe(1);
    expect(wedges?.portionCount).toBe(1);
    expect(wedges?.weightBeforeGrams).toBe(180);
    expect(wedges?.weightAfterGrams).toBe(150);

    // Rice: started at 2, 1 replaced by fettuccine -> net 1
    expect(rice?.portionCount).toBe(1);
    expect(fettuccine?.portionCount).toBe(1);
    expect(fettuccine?.weightBeforeGrams).toBe(65);
    expect(fettuccine?.weightAfterGrams).toBe(150);
  });

  it('ignores container-packaging notes and sauce exclusions while honoring real slot replacements', () => {
    const clauses = parseSmartInstructionClauses(
      'تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة - بدون صوص مشروم - الخضار يكون جزر فقط',
    );
    expect(clauses).toEqual([
      expect.objectContaining({ kind: 'exclude', fromTarget: 'صوص مشروم' }),
      expect.objectContaining({ kind: 'substitute', fromTarget: 'الخضار', toTarget: 'جزر' }),
    ]);

    const orders: Order[] = [
      makeOrder({
        id: 'pack-1',
        brand_id: 'brand-hf',
        selected_meal_ids: ['meal-steak'],
        notes: 'الخضار السوتيه في طبق منفرد خارج الوجبة - بدون صوص مشروم',
      }),
    ];

    const report = aggregateKitchenIngredients({
      orders,
      brands,
      meals: catalogMeals,
      packages: emptyPackages,
      date: '2026-11-14',
    });

    // Neither packaging note nor sauce note removes solid veggies or steak
    expect(report.combined.items.find((i) => i.key === 'vegetables')?.portionCount).toBe(1);
    expect(report.combined.items.find((i) => i.key === 'beef_steak')?.portionCount).toBe(1);
  });

  it('excludes frozen / ready-to-cook items from hot-kitchen ingredient cooking totals', () => {
    const orders: Order[] = [
      makeOrder({
        id: 'cooked-1',
        brand_id: 'brand-pb',
        imported_meal_details: ['Beef Shawarma'],
      }),
      makeOrder({
        id: 'frozen-1',
        brand_id: 'brand-pb',
        phone: '01991112222',
        imported_meal_details: ['Beef Shawarma — Raw and frozen'],
      }),
    ];

    const report = aggregateKitchenIngredients({
      orders,
      brands,
      meals: catalogMeals,
      packages: emptyPackages,
      date: '2026-11-14',
    });

    expect(report.combined.cookedMealCount).toBe(1);
    expect(report.combined.frozenExcludedMealCount).toBe(1);
    expect(report.combined.items.find((i) => i.key === 'rice')?.portionCount).toBe(1);
    expect(report.combined.items.find((i) => i.key === 'beef_strips')?.portionCount).toBe(1);
  });
});
