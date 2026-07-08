import { describe, expect, it } from 'vitest';
import { buildDemoOrders, DEMO_ORDER_NUMBER_PREFIX, hasCompleteDemoOrders, materializeDemoOrders } from '@/lib/demoOrders';

const brands = [
  { id: 'brand-1', name: 'Healthy Food', color: '#22c55e' },
  { id: 'brand-2', name: 'Healthy Station', color: '#3b82f6' },
  { id: 'brand-3', name: 'Protein Box', color: '#f59e0b' },
];

describe('demo orders generator', () => {
  it('builds 10 demo orders for March 21-23 across the three companies', () => {
    const orders = buildDemoOrders(brands);

    expect(orders).toHaveLength(10);
    expect(orders.every((order) => order.order_number.startsWith(DEMO_ORDER_NUMBER_PREFIX))).toBe(true);
    expect(orders.filter((order) => order.execution_date === '2026-03-21')).toHaveLength(3);
    expect(orders.filter((order) => order.execution_date === '2026-03-22')).toHaveLength(4);
    expect(orders.filter((order) => order.execution_date === '2026-03-23')).toHaveLength(3);
    expect(new Set(orders.map((order) => order.brand_id))).toEqual(new Set(['brand-1', 'brand-2', 'brand-3']));
  });

  it('includes both package and meal-based orders with intentional repetition', () => {
    const orders = buildDemoOrders(brands);
    const packageOrders = orders.filter((order) => order.order_mode === 'package');
    const mealOrders = orders.filter((order) => order.order_mode === 'meals');

    expect(packageOrders.length).toBeGreaterThan(0);
    expect(mealOrders.length).toBeGreaterThan(0);
    expect(mealOrders.some((order) => order.package.includes(' + '))).toBe(true);

    const repeatedMealLabels = mealOrders.map((order) => order.package);
    const uniqueMealLabels = new Set(repeatedMealLabels);
    expect(uniqueMealLabels.size).toBeLessThan(repeatedMealLabels.length);
    expect(packageOrders.every((order) => (order.package_meal_snapshot ?? []).length > 0)).toBe(true);
  });

  it('materializes demo orders and marks the set as complete', () => {
    const orders = materializeDemoOrders(brands);

    expect(orders.every((order) => order.id.startsWith('demo-order-'))).toBe(true);
    expect(orders.every((order) => order.created_at === '2026-03-20T09:00:00.000Z')).toBe(true);
    expect(hasCompleteDemoOrders(orders)).toBe(true);
  });
});