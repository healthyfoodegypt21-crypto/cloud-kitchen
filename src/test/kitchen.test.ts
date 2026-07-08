import { describe, expect, it } from 'vitest';
import { aggregateKitchenOrders } from '@/lib/kitchen';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

const brands = [
  { id: 'brand-1', name: 'Healthy Food', color: '#22c55e' },
  { id: 'brand-2', name: 'Healthy Station', color: '#3b82f6' },
];

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
  {
    id: 'meal-3',
    brand_id: 'brand-2',
    name: 'بيف استيك',
    category: 'meat',
    price: 230,
    protein: 42,
    carbs: 18,
    fat: 10,
    calories: 370,
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
      {
        id: 'item-1',
        menu_item_id: 'meal-1',
        custom_meal_name: null,
        display_order: 0,
        label: 'بيف استيك',
        source: 'menu',
      },
      {
        id: 'item-2',
        menu_item_id: 'meal-2',
        custom_meal_name: null,
        display_order: 1,
        label: 'فراخ جريل',
        source: 'menu',
      },
    ],
  },
  {
    id: 'package-2',
    brand_id: 'brand-2',
    name: 'باقة بروتين',
    days_count: 3,
    price: 680,
    created_at: '2026-03-20T09:00:00.000Z',
    updated_at: '2026-03-20T09:00:00.000Z',
    items: [
      {
        id: 'item-3',
        menu_item_id: 'meal-3',
        custom_meal_name: null,
        display_order: 0,
        label: 'بيف استيك',
        source: 'menu',
      },
    ],
  },
];

const orders: Order[] = [
  {
    id: 'order-1',
    order_number: 'ORD-1',
    customer_name: 'عميل 1',
    phone: '01000000001',
    phone_secondary: '',
    address: 'العنوان 1',
    address_house_number: '',
    address_street: '',
    address_area: '',
    address_floor: '',
    address_apartment: '',
    execution_date: '2026-03-22',
    order_mode: 'meals',
    package: 'بيف استيك + فراخ جريل',
    package_plan_id: null,
    meal_type: 'lunch',
    notes: 'بدون رز',
    status: 'confirmed',
    created_at: '2026-03-20T09:00:00.000Z',
    price: 390,
    meal_customizations: [
      { key: 'meal-1', label: 'بيف استيك', notes: 'بدون بطاطس' },
    ],
    selected_meal_ids: ['meal-1', 'meal-2'],
    source: 'other',
    brand_id: 'brand-1',
    created_by: null,
  },
  {
    id: 'order-2',
    order_number: 'ORD-2',
    customer_name: 'عميل 2',
    phone: '01000000002',
    phone_secondary: '',
    address: 'العنوان 2',
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
    created_at: '2026-03-20T09:10:00.000Z',
    price: 950,
    selected_meal_ids: [],
    source: 'other',
    brand_id: 'brand-1',
    created_by: null,
  },
  {
    id: 'order-3',
    order_number: 'ORD-3',
    customer_name: 'عميل 3',
    phone: '01000000003',
    phone_secondary: '',
    address: 'العنوان 3',
    address_house_number: '',
    address_street: '',
    address_area: '',
    address_floor: '',
    address_apartment: '',
    execution_date: '2026-03-22',
    order_mode: 'meals',
    package: 'بيف استيك',
    package_plan_id: null,
    meal_type: 'lunch',
    notes: 'طلب تجريبي لا يجب اعتباره تعديل',
    status: 'cancelled',
    created_at: '2026-03-20T09:20:00.000Z',
    price: 220,
    selected_meal_ids: ['meal-1'],
    source: 'other',
    brand_id: 'brand-1',
    created_by: null,
  },
  {
    id: 'order-4',
    order_number: 'ORD-4',
    customer_name: 'عميل 4',
    phone: '01000000004',
    phone_secondary: '',
    address: 'العنوان 4',
    address_house_number: '',
    address_street: '',
    address_area: '',
    address_floor: '',
    address_apartment: '',
    execution_date: '2026-03-22',
    order_mode: 'package',
    package: 'باقة بروتين',
    package_plan_id: 'package-2',
    meal_type: 'lunch',
    notes: 'بدون صوص',
    status: 'confirmed',
    created_at: '2026-03-20T09:30:00.000Z',
    price: 680,
    selected_meal_ids: [],
    source: 'other',
    brand_id: 'brand-2',
    created_by: null,
  },
];

describe('aggregateKitchenOrders', () => {
  it('groups repeated meals and nests modified versions beneath the same meal', () => {
    const summary = aggregateKitchenOrders({
      orders,
      brands,
      meals,
      packages,
      date: '2026-03-22',
      brandId: 'brand-1',
    });

    expect(summary.orderCount).toBe(3);
    expect(summary.totalMealCount).toBe(5);
    expect(summary.totalDistinctMeals).toBe(2);
    expect(summary.brands).toHaveLength(1);

    const [brandSummary] = summary.brands;
    const beef = brandSummary.meals.find(meal => meal.label === 'بيف استيك');
    const chicken = brandSummary.meals.find(meal => meal.label === 'فراخ جريل');

    expect(beef?.count).toBe(3);
    expect(chicken?.count).toBe(2);
    expect(beef?.modifications).toEqual([
      expect.objectContaining({ label: 'بيف استيك - بدون رز | بدون بطاطس', count: 1 }),
    ]);
    expect(chicken?.modifications).toEqual([
      expect.objectContaining({ label: 'فراخ جريل - بدون رز', count: 1 }),
    ]);
  });

  it('merges shared dishes across all companies into one printable preparation list', () => {
    const summary = aggregateKitchenOrders({
      orders,
      brands,
      meals,
      packages,
      date: '2026-03-22',
      brandId: 'all',
    });

    expect(summary.isCombinedView).toBe(true);
    expect(summary.brands).toHaveLength(1);
    expect(summary.orderCount).toBe(4);
    expect(summary.totalMealCount).toBe(6);

    const [combinedSummary] = summary.brands;
    const beef = combinedSummary.meals.find(meal => meal.label === 'بيف استيك');
    const chicken = combinedSummary.meals.find(meal => meal.label === 'فراخ جريل');

    expect(combinedSummary.brandName).toBe('كل الشركات');
    expect(beef?.count).toBe(4);
    expect(chicken?.count).toBe(2);
    expect(beef?.modifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'بيف استيك - بدون رز | بدون بطاطس', count: 1 }),
      expect.objectContaining({ label: 'بيف استيك - بدون صوص', count: 1 }),
    ]));
  });
});