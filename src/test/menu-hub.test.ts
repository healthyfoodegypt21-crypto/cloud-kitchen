import { describe, expect, it } from 'vitest';
import {
  buildCustomerMenuShowcaseText,
  buildMenuEngineeringReport,
  computeMealCostBreakdown,
  computePackageSavings,
  parseImportedIngredientsList,
} from '@/lib/menuHub';
import { hasPageAccess } from '@/lib/permissions';
import type { Meal, PackagePlan } from '@/types/menu';
import type { Order } from '@/types/order';

describe('Unified Menu Hub helpers', () => {
  it('grants menu-packages access when user holds either menu-packages or legacy companies-menus permission', () => {
    expect(hasPageAccess('call_center', ['companies-menus'], 'menu-packages')).toBe(true);
    expect(hasPageAccess('call_center', ['menu-packages'], 'companies-menus')).toBe(true);
    expect(hasPageAccess('call_center', ['orders'], 'menu-packages')).toBe(false);
  });

  it('computes live recipe food cost and margin from gram weights and inventory costs', () => {
    const meal: Pick<Meal, 'price' | 'ingredients'> = {
      price: 200,
      ingredients: [
        { name: 'شرائح دجاج', weight_before_grams: 200, weight_after_grams: 125 },
        { name: 'أرز بسمتي', weight_before_grams: 100, weight_after_grams: 180 },
      ],
    };

    const breakdown = computeMealCostBreakdown(
      meal,
      [],
      [
        { id: 'inv-1', name: 'شرائح دجاج', usageUnit: 'kg', avgCostPerUsageUnit: 220 },
        { id: 'inv-2', name: 'أرز بسمتي', usageUnit: 'kg', avgCostPerUsageUnit: 60 },
      ],
    );

    // 0.2 * 220 (44) + 0.1 * 60 (6) = 50 EGP -> 25% food cost, 150 EGP gross profit
    expect(breakdown.estimatedCost).toBe(50);
    expect(breakdown.grossProfit).toBe(150);
    expect(breakdown.foodCostPct).toBe(25);
    expect(breakdown.isHighFoodCost).toBe(false);
  });

  it('computes package daily rate and savings vs standalone meal prices', () => {
    const meals: Meal[] = [
      {
        id: 'm1',
        brand_id: 'b1',
        name: 'Steak',
        category: 'meat',
        price: 250,
        protein: 40,
        carbs: 20,
        fat: 12,
        calories: 380,
        created_at: '',
        updated_at: '',
      },
      {
        id: 'm2',
        brand_id: 'b1',
        name: 'Chicken',
        category: 'chicken',
        price: 200,
        protein: 35,
        carbs: 25,
        fat: 8,
        calories: 320,
        created_at: '',
        updated_at: '',
      },
    ];

    const pkg: PackagePlan = {
      id: 'p1',
      brand_id: 'b1',
      name: 'باقة يومين',
      days_count: 2,
      price: 360,
      created_at: '',
      updated_at: '',
      items: [
        { id: 'i1', menu_item_id: 'm1', custom_meal_name: null, display_order: 0, label: 'Steak', source: 'menu' },
        { id: 'i2', menu_item_id: 'm2', custom_meal_name: null, display_order: 1, label: 'Chicken', source: 'menu' },
      ],
    };

    const savings = computePackageSavings(pkg, meals);
    expect(savings.dailyRate).toBe(180);
    expect(savings.standaloneValue).toBe(450);
    expect(savings.savingsAmount).toBe(90);
    expect(savings.savingsPct).toBe(20);
  });

  it('parses imported Excel ingredient lists with pre/post cooking weights and protein defaults', () => {
    const parsed = parseImportedIngredientsList('شرائح دجاج، أرز بسمتي (100->180)');
    expect(parsed).toEqual([
      { name: 'شرائح دجاج', weight_before_grams: 200, weight_after_grams: 125 },
      { name: 'أرز بسمتي', weight_before_grams: 100, weight_after_grams: 180 },
    ]);
  });

  it('generates WhatsApp showcase text and Menu Engineering dormant meal analytics', () => {
    const meals: Meal[] = [
      {
        id: 'm1',
        brand_id: 'b1',
        name: 'Grilled Chicken',
        description: 'دجاج مشوي بالأعشاب',
        category: 'chicken',
        price: 210,
        protein: 38,
        carbs: 22,
        fat: 8,
        fiber: 4,
        calories: 320,
        is_available: true,
        created_at: '',
        updated_at: '',
      },
      {
        id: 'm2',
        brand_id: 'b1',
        name: 'Dormant Fish',
        category: 'fish',
        price: 260,
        protein: 36,
        carbs: 15,
        fat: 10,
        calories: 310,
        is_available: true,
        created_at: '',
        updated_at: '',
      },
    ];

    const showcase = buildCustomerMenuShowcaseText({
      companyName: 'Healthy Food',
      phone: '01012345678',
      meals,
      packages: [],
    });
    expect(showcase).toContain('Healthy Food');
    expect(showcase).toContain('Grilled Chicken');
    expect(showcase).toContain('Fiber:4g');

    const order: Order = {
      id: 'o1',
      order_number: 'ORD-1',
      customer_name: 'عميل',
      phone: '01012345678',
      phone_secondary: '',
      address: 'القاهرة',
      address_house_number: '',
      address_street: '',
      address_area: '',
      address_floor: '',
      address_apartment: '',
      execution_date: new Date().toISOString().slice(0, 10),
      order_mode: 'meals',
      package: '',
      package_plan_id: null,
      meal_type: 'lunch',
      notes: '',
      status: 'delivered',
      created_at: new Date().toISOString(),
      price: 210,
      selected_meal_ids: ['m1'],
      source: 'instagram',
      brand_id: 'b1',
      created_by: null,
    };

    const report = buildMenuEngineeringReport('b1', meals, [], [order]);
    expect(report.totalBrandOrders30d).toBe(1);
    expect(report.topMeals[0]?.name).toBe('Grilled Chicken');
    expect(report.dormantMeals.map((m) => m.name)).toEqual(['Dormant Fish']);
  });
});
