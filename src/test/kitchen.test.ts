import { describe, expect, it } from 'vitest';
import {
  aggregateDailyMealsByBrand,
  aggregateKitchenOrders,
  KITCHEN_CATEGORY_LABELS,
  KITCHEN_COOKED_CATEGORY_ORDER,
} from '@/lib/kitchen';
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
  it('uses imported meal details when an imported package has no catalog package link', () => {
    const importedOrder = {
      ...orders[0],
      id: 'imported-order',
      order_mode: 'package' as const,
      package: 'باكدج ٦وجبات',
      package_plan_id: null,
      selected_meal_ids: [],
      imported_meal_details: ['بيف استيك', 'فراخ جريل', 'فراخ جريل'],
    };
    const aggregation = aggregateKitchenOrders({
      orders: [importedOrder],
      brands,
      meals,
      packages: [],
      date: '2026-03-22',
      brandId: 'brand-1',
    });

    expect(aggregation.totalMealCount).toBe(3);
    expect(aggregation.brands[0].meals.find(meal => meal.label === 'بيف استيك')?.count).toBe(1);
    expect(aggregation.brands[0].meals.find(meal => meal.label === 'فراخ جريل')?.count).toBe(2);
  });

  it('groups imported sheet meals and attaches per-meal comments next to the item while ignoring delivery notes', () => {
    const importedOrder1 = {
      ...orders[0],
      id: 'imported-sheet-1',
      phone: '01999999991',
      order_mode: 'package' as const,
      package: 'weekly',
      package_plan_id: null,
      selected_meal_ids: [],
      meal_customizations: [],
      notes: 'قبل الساعة 6 - تفاصيل الطلب المستوردة: شاورما، شاورما - رسوم التوصيل: 80',
      imported_meal_details: [
        'شاورما',
        'شاورما — بدون تومية',
      ],
    };
    const importedOrder2 = {
      ...importedOrder1,
      id: 'imported-sheet-2',
      phone: '01999999992',
      notes: 'مدفوع انستاباي - تفاصيل الطلب المستوردة: شاورما',
      imported_meal_details: [
        'شاورما',
        'شاورما — عيش صاج إضافي',
      ],
    };

    const summary = aggregateKitchenOrders({
      orders: [importedOrder1, importedOrder2],
      brands,
      meals,
      packages: [],
      date: '2026-03-22',
      brandId: 'all',
    });

    const shawarma = summary.brands[0].meals.find(meal => meal.label === 'شاورما');

    expect(summary.totalMealCount).toBe(4);
    expect(shawarma?.count).toBe(4);
    expect(shawarma?.modifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ instruction: 'بدون تومية', count: 1 }),
      expect.objectContaining({ instruction: 'عيش صاج إضافي', count: 1 }),
    ]));
    expect(shawarma?.modifications).toHaveLength(2);
  });

  it('builds daily shared-meal totals with one quantity column per brand', () => {
    const aggregation = aggregateDailyMealsByBrand({ orders, brands, meals, packages, date: '2026-03-22' });
    const beef = aggregation.rows.find(row => row.label === 'بيف استيك');
    const chicken = aggregation.rows.find(row => row.label === 'فراخ جريل');

    expect(aggregation.brands.map(brand => brand.name)).toEqual(['Healthy Food', 'Healthy Station']);
    expect(beef?.countsByBrand).toEqual({ 'brand-1': 3, 'brand-2': 1 });
    expect(beef?.total).toBe(4);
    expect(chicken?.countsByBrand).toEqual({ 'brand-1': 2 });
    expect(chicken?.total).toBe(2);
  });

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

  it('orders cooked sections as Chicken, Beef, Mix, Seafood, Salad, Snacks, Breakfast & Dinner and sorts meals alphabetically inside each section', () => {
    expect(KITCHEN_COOKED_CATEGORY_ORDER.slice(0, 7).map(cat => KITCHEN_CATEGORY_LABELS[cat])).toEqual([
      'Chicken',
      'Beef',
      'Mix',
      'Seafood',
      'Salad',
      'Snacks',
      'Breakfast & Dinner',
    ]);

    const catalogMeals: Meal[] = [
      { id: 'm-chk-z', brand_id: 'brand-1', name: 'Zesty Chicken', category: 'chicken', price: 200, protein: 35, carbs: 20, fat: 8, calories: 300, created_at: '', updated_at: '' },
      { id: 'm-chk-a', brand_id: 'brand-1', name: 'Almond Teriyaki Chicken', category: 'chicken', price: 200, protein: 35, carbs: 20, fat: 8, calories: 300, created_at: '', updated_at: '' },
      { id: 'm-beef', brand_id: 'brand-1', name: 'Beef Shawarma', category: 'meat', price: 220, protein: 40, carbs: 20, fat: 10, calories: 350, created_at: '', updated_at: '' },
      { id: 'm-mix', brand_id: 'brand-1', name: 'Mix Grill', category: 'mix', price: 230, protein: 42, carbs: 20, fat: 10, calories: 360, created_at: '', updated_at: '' },
      { id: 'm-sea', brand_id: 'brand-1', name: 'Salmon Fillet', category: 'fish', price: 260, protein: 38, carbs: 15, fat: 14, calories: 340, created_at: '', updated_at: '' },
      { id: 'm-salad', brand_id: 'brand-1', name: 'Greek Salad', category: 'salad', price: 120, protein: 12, carbs: 10, fat: 6, calories: 160, created_at: '', updated_at: '' },
      { id: 'm-snack', brand_id: 'brand-1', name: 'Protein Cupcake', category: 'snacks', price: 90, protein: 15, carbs: 14, fat: 4, calories: 150, created_at: '', updated_at: '' },
      { id: 'm-bf', brand_id: 'brand-1', name: 'Dinner Meal 2', category: 'mix', custom_category: 'Dinner', price: 165, protein: 20, carbs: 20, fat: 8, calories: 250, created_at: '', updated_at: '' },
      { id: 'm-bf-2', brand_id: 'brand-1', name: 'Breakfast Meal 1', category: 'snacks', custom_category: 'Breakfast', price: 165, protein: 20, carbs: 20, fat: 8, calories: 250, created_at: '', updated_at: '' },
    ];

    const multiOrder: Order = {
      ...orders[0],
      id: 'ord-multi',
      notes: '',
      meal_customizations: [],
      // Give Zesty Chicken MORE quantity (3) than Almond Teriyaki Chicken (1) to verify alphabetical order wins over count
      selected_meal_ids: ['m-bf', 'm-snack', 'm-salad', 'm-sea', 'm-mix', 'm-beef', 'm-chk-z', 'm-chk-z', 'm-chk-z', 'm-chk-a', 'm-bf-2'],
    };

    const summary = aggregateKitchenOrders({
      orders: [multiOrder],
      brands,
      meals: catalogMeals,
      packages: [],
      date: '2026-03-22',
      brandId: 'brand-1',
    });

    const orderedMeals = summary.brands[0].meals;
    expect(orderedMeals.map(m => `${KITCHEN_CATEGORY_LABELS[m.category]}:${m.label}`)).toEqual([
      'Chicken:Almond Teriyaki Chicken',
      'Chicken:Zesty Chicken',
      'Beef:Beef Shawarma',
      'Mix:Mix Grill',
      'Seafood:Salmon Fillet',
      'Salad:Greek Salad',
      'Snacks:Protein Cupcake',
      'Breakfast & Dinner:Breakfast Meal 1',
      'Breakfast & Dinner:Dinner Meal 2',
    ]);
  });

  it('isolates frozen and ready-to-cook meals into a separate group even when they share the exact same name as cooked meals', () => {
    const cookedAndFrozenMeals: Meal[] = [
      { id: 'm-beef-cooked', brand_id: 'brand-1', name: 'Beef shawarma', category: 'meat', price: 220, protein: 40, carbs: 20, fat: 10, calories: 350, created_at: '', updated_at: '' },
      { id: 'm-chk-cooked', brand_id: 'brand-1', name: 'Chicken shawarma', category: 'chicken', price: 200, protein: 38, carbs: 20, fat: 8, calories: 320, created_at: '', updated_at: '' },
      { id: 'm-rtc-cat', brand_id: 'brand-2', name: 'Kofta Box', category: 'meat', custom_category: 'Ready to Cook', price: 210, protein: 40, carbs: 10, fat: 12, calories: 310, created_at: '', updated_at: '' },
    ];

    const cookedOrder: Order = {
      ...orders[0],
      id: 'ord-cooked',
      brand_id: 'brand-1',
      notes: '',
      meal_customizations: [],
      imported_meal_details: ['Beef shawarma', 'Beef shawarma', 'Chicken shawarma'],
    };

    const frozenImportedOrder: Order = {
      ...orders[0],
      id: 'ord-frozen-1',
      brand_id: 'brand-1',
      phone: '01990000001',
      notes: '',
      meal_customizations: [],
      imported_meal_details: [
        'Beef shawarma — Raw and frozen',
        'Chicken shawarma — Ready to cook',
      ],
    };

    const rtcCatalogOrder: Order = {
      ...orders[0],
      id: 'ord-frozen-2',
      brand_id: 'brand-2',
      phone: '01990000002',
      notes: '',
      meal_customizations: [],
      selected_meal_ids: ['m-rtc-cat'],
    };

    const combined = aggregateKitchenOrders({
      orders: [cookedOrder, frozenImportedOrder, rtcCatalogOrder],
      brands,
      meals: cookedAndFrozenMeals,
      packages: [],
      date: '2026-03-22',
      brandId: 'all',
    });

    const allItems = combined.brands[0].meals;
    const cookedBeef = allItems.find(m => m.category === 'meat' && m.label === 'Beef shawarma');
    const cookedChicken = allItems.find(m => m.category === 'chicken' && m.label === 'Chicken shawarma');
    const frozenItems = allItems.filter(m => m.category === 'frozen');

    expect(cookedBeef?.count).toBe(2);
    expect(cookedChicken?.count).toBe(1);
    expect(frozenItems.map(m => ({ label: m.label, count: m.count }))).toEqual([
      { label: 'Beef shawarma', count: 1 },
      { label: 'Chicken shawarma', count: 1 },
      { label: 'Kofta Box', count: 1 },
    ]);

    const daily = aggregateDailyMealsByBrand({
      orders: [cookedOrder, frozenImportedOrder, rtcCatalogOrder],
      brands,
      meals: cookedAndFrozenMeals,
      packages: [],
      date: '2026-03-22',
    });

    const dailyCookedBeef = daily.rows.find(r => r.category !== 'frozen' && r.label === 'Beef shawarma');
    const dailyFrozenBeef = daily.rows.find(r => r.category === 'frozen' && r.label === 'Beef shawarma');
    expect(dailyCookedBeef?.total).toBe(2);
    expect(dailyFrozenBeef?.total).toBe(1);
  });
});