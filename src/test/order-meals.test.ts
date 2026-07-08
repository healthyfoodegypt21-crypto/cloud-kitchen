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