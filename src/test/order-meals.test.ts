import { describe, expect, it } from 'vitest';
import { getOrderMealCount, getOrdersMealCount, resolveOrderMeals } from '@/lib/orderMeals';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

const meals: Meal[] = [
  {
    id: 'meal-1',
    brand_id: 'brand-1',
    name: 'بيف استيك',
    category: 'meat',
    price: 220,
    protein: 40,
    carbs: 20,
    fat: 12,
    calories: 380,
    created_at: '2026-03-20T09:00:00.000Z',
    updated_at: '2026-03-20T09:00:00.000Z',
  },
  {
    id: 'meal-2',
    brand_id: 'brand-1',
    name: 'فراخ جريل',
    category: 'chicken',
    price: 170,
    protein: 35,
    carbs: 18,
    fat: 8,
    calories: 310,
    created_at: '2026-03-20T09:00:00.000Z',
    updated_at: '2026-03-20T09:00:00.000Z',
  },
];

const packages: PackagePlan[] = [
  {
    id: 'package-1',
    brand_id: 'brand-1',
    name: 'باقة كيتو',
    days_count: 5,
    price: 950,
    created_at: '2026-03-20T09:00:00.000Z',
    updated_at: '2026-03-20T09:00:00.000Z',
    items: [
      { id: 'item-1', menu_item_id: 'meal-1', custom_meal_name: null, display_order: 0, label: 'بيف استيك', source: 'menu' },
      { id: 'item-2', menu_item_id: 'meal-2', custom_meal_name: null, display_order: 1, label: 'فراخ جريل', source: 'menu' },
    ],
  },
];

const packageOrder: Order = {
  id: 'order-1',
  order_number: 'ORD-1',
  customer_name: 'عميل',
  phone: '01000000001',
  phone_secondary: '',
  location_link: '',
  address: 'العنوان',
  address_house_number: '',
  address_street: '',
  address_area: '',
  address_floor: '',
  address_apartment: '',
  execution_date: '2026-03-22',
  order_mode: 'package',
  package: 'باقة كيتو',
  package_plan_id: 'package-1',
  meal_type: 'full_day',
  notes: '',
  status: 'new',
  created_at: '2026-03-20T09:00:00.000Z',
  price: 950,
  selected_meal_ids: [],
  source: 'other',
  brand_id: 'brand-1',
  created_by: null,
};

describe('order meal resolution', () => {
  it('expands package orders into their meal items', () => {
    const resolved = resolveOrderMeals(packageOrder, meals, packages);
    expect(resolved.map(meal => meal.label)).toEqual(['بيف استيك', 'فراخ جريل']);
    expect(resolved.map(meal => meal.category)).toEqual(['meat', 'chicken']);
    expect(getOrderMealCount(packageOrder, meals, packages)).toBe(2);
  });

  it('does not return the package name itself when a package cannot be resolved', () => {
    const unresolvedPackageOrder = {
      ...packageOrder,
      package_plan_id: null,
      package: 'باقة غير موجودة',
    };

    expect(resolveOrderMeals(unresolvedPackageOrder, meals, packages)).toEqual([]);
  });

  it('matches package orders by close package name within the same brand', () => {
    const legacyNamedPackageOrder = {
      ...packageOrder,
      package_plan_id: null,
      package: 'باقة كيتو جرين',
    };

    expect(resolveOrderMeals(legacyNamedPackageOrder, meals, packages).map(meal => meal.label)).toEqual([
      'بيف استيك',
      'فراخ جريل',
    ]);
  });

  it('uses the stored package meal snapshot when package lookup is unavailable', () => {
    const snapshotPackageOrder = {
      ...packageOrder,
      package_plan_id: null,
      package: 'باقة محفوظة قديمة',
      package_meal_snapshot: [
        { key: 'snapshot-1', label: 'بيف استيك' },
        { key: 'snapshot-2', label: 'فراخ جريل' },
      ],
    };

    expect(resolveOrderMeals(snapshotPackageOrder, meals, []).map(meal => meal.label)).toEqual([
      'بيف استيك',
      'فراخ جريل',
    ]);
    expect(getOrderMealCount(snapshotPackageOrder, meals, [])).toBe(2);
  });

  it('recovers imported meal details from legacy notes formatting', () => {
    const importedOrder = {
      ...packageOrder,
      package_plan_id: null,
      package: 'باكدج ٦وجبات',
      notes: 'ملاحظة قديمة\nتفاصيل الشيت : بيف استيك | فراخ جريل | فراخ جريل',
      imported_meal_details: [],
    };

    expect(resolveOrderMeals(importedOrder, meals, []).map(meal => meal.label)).toEqual([
      'بيف استيك',
      'فراخ جريل',
      'فراخ جريل',
    ]);
  });

  it('recovers imported meal details from the current import notes format', () => {
    const importedOrder = {
      ...packageOrder,
      package_plan_id: null,
      package: 'باكدج ٦وجبات',
      notes: 'ملاحظة العميل - تفاصيل الطلب المستوردة: بيف استيك، فراخ جريل، فراخ جريل - رسوم التوصيل: 20',
      imported_meal_details: [],
    };

    expect(resolveOrderMeals(importedOrder, meals, []).map(meal => meal.label)).toEqual([
      'بيف استيك',
      'فراخ جريل',
      'فراخ جريل',
    ]);
  });

  it('resolves catalog package items when imported details only repeat the package name', () => {
    const importedOrder = {
      ...packageOrder,
      imported_meal_details: ['باقة كيتو'],
    };

    expect(resolveOrderMeals(importedOrder, meals, packages).map(meal => meal.label)).toEqual([
      'بيف استيك',
      'فراخ جريل',
    ]);
  });

  it('keeps the imported package name as a fallback when no catalog package matches', () => {
    const importedOrder = {
      ...packageOrder,
      package_plan_id: null,
      package: 'Weekly',
      imported_meal_details: ['weekly'],
    };

    expect(resolveOrderMeals(importedOrder, meals, packages).map(meal => meal.label)).toEqual(['weekly']);
    expect(getOrderMealCount(importedOrder, meals, packages)).toBe(1);
  });

  it('drops only the package-name entry when imported details also list real meals', () => {
    const importedOrder = {
      ...packageOrder,
      package_plan_id: null,
      package: 'باكدج ٦وجبات',
      imported_meal_details: ['باكدج ٦وجبات', 'بيف استيك'],
    };

    expect(resolveOrderMeals(importedOrder, meals, packages).map(meal => meal.label)).toEqual(['بيف استيك']);
  });

  it('recovers the actual sheet meals when an earlier import stored only weekly for a known sheet customer', () => {
    const brokenWeeklyOrder = {
      ...packageOrder,
      phone: '010 97660718',
      package_plan_id: null,
      package: 'weekly',
      imported_meal_details: ['weekly'],
    };

    expect(resolveOrderMeals(brokenWeeklyOrder, meals, packages).map(meal => meal.label)).toEqual([
      'Stuffed grilled chicken',
      'Hawaiian Chicken',
      'Almond Teriyaki Chicken',
      'Chicken Alfredo',
      'Chicken Blackend',
      'Blue Cheese Salad ( S )',
    ]);
  });

  it('splits imported meal labels from their comments and infers English categories', () => {
    const importedWithComments = {
      ...packageOrder,
      package_plan_id: null,
      package: 'weekly',
      imported_meal_details: [
        'Chicken lemon sauce — تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة',
        'Beef shawarma — Raw and frozen',
      ],
    };

    const resolved = resolveOrderMeals(importedWithComments, meals, packages);
    expect(resolved).toEqual([
      expect.objectContaining({
        label: 'Chicken lemon sauce',
        instruction: 'تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة',
        category: 'chicken',
      }),
      expect.objectContaining({
        label: 'Beef shawarma',
        instruction: 'Raw and frozen',
        category: 'meat',
      }),
    ]);
  });

  it('uses imported details even when the sheet marked a package as meals', () => {
    const importedOrder = {
      ...packageOrder,
      order_mode: 'meals' as const,
      package_plan_id: null,
      package: 'باكدج ٦وجبات',
      selected_meal_ids: [],
      imported_meal_details: ['بيف استيك', 'فراخ جريل'],
    };

    expect(resolveOrderMeals(importedOrder, meals, []).map(meal => meal.label)).toEqual(['بيف استيك', 'فراخ جريل']);
  });

  it('falls back to known demo package blueprints when a legacy 20-day package has no catalog match', () => {
    const legacyDemoPackageOrder = {
      ...packageOrder,
      package_plan_id: null,
      package: 'باقة التحدي 20 يوم بوكس',
      package_meal_snapshot: [],
    };

    expect(getOrderMealCount(legacyDemoPackageOrder, meals, [])).toBe(20);
    expect(resolveOrderMeals(legacyDemoPackageOrder, meals, []).some(meal => meal.category === 'meat')).toBe(true);
  });

  it('infers categories for old demo package items even when the live catalog is unavailable', () => {
    const oldSnapshotOrder = {
      ...packageOrder,
      package_plan_id: null,
      package_meal_snapshot: [
        { key: 'old-1', label: 'ستيك مشروم ستيشن' },
        { key: 'old-2', label: 'لحم بصل مشوي ستيشن' },
      ],
    };

    expect(resolveOrderMeals(oldSnapshotOrder, [], []).map(meal => meal.category)).toEqual(['meat', 'meat']);
  });

  it('matches split meal names back to their categories when selected meal ids are missing', () => {
    const legacyMealsOrder = {
      ...packageOrder,
      order_mode: 'meals' as const,
      package_plan_id: null,
      package: 'بيف استيك + فراخ جريل',
    };

    expect(resolveOrderMeals(legacyMealsOrder, meals, packages).map(meal => meal.category)).toEqual([
      'meat',
      'chicken',
    ]);
  });

  it('sums meal counts across mixed orders', () => {
    const directOrder = { ...packageOrder, id: 'order-2', order_mode: 'meals' as const, package_plan_id: null, package: 'بيف استيك', selected_meal_ids: ['meal-1'] };
    expect(getOrdersMealCount([packageOrder, directOrder], meals, packages)).toBe(3);
  });
});