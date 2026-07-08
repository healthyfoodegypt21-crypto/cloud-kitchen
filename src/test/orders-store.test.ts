import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addOrder, generateId, getOrders, saveOrders, updateOrderStatus } from '@/store/orders';
import type { Order } from '@/types/order';

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    order_number: 'ORD-001',
    customer_name: 'عميل تجريبي',
    phone: '01000000000',
    phone_secondary: '',
    location_link: '',
    address: 'القاهرة',
    address_house_number: '12',
    address_street: 'شارع التحرير',
    address_area: 'الدقي',
    address_floor: '3',
    address_apartment: '12',
    execution_date: '2026-07-05',
    order_mode: 'meals',
    package: '',
    package_plan_id: null,
    meal_type: 'lunch',
    notes: '',
    meal_customizations: [],
    package_meal_snapshot: [],
    status: 'new',
    created_at: '2026-07-05T12:00:00.000Z',
    price: 250,
    selected_meal_ids: ['meal-1'],
    source: 'website',
    brand_id: 'brand-1',
    created_by: 'user-1',
    ...overrides,
  };
}

describe('orders store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns an empty list when no orders are stored', () => {
    expect(getOrders()).toEqual([]);
  });

  it('prepends new orders and persists status updates', () => {
    saveOrders([createOrder({ id: 'order-older', order_number: 'ORD-OLD' })]);

    addOrder(createOrder({ id: 'order-newer', order_number: 'ORD-NEW' }));
    updateOrderStatus('order-newer', 'confirmed');

    expect(getOrders()).toMatchObject([
      { id: 'order-newer', order_number: 'ORD-NEW', status: 'confirmed' },
      { id: 'order-older', order_number: 'ORD-OLD', status: 'new' },
    ]);
  });

  it('ignores status updates for unknown orders', () => {
    saveOrders([createOrder({ id: 'order-1', status: 'new' })]);

    updateOrderStatus('missing-order', 'cancelled');

    expect(getOrders()).toMatchObject([{ id: 'order-1', status: 'new' }]);
  });

  it('generates ids with the expected prefix', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_752_000_000_000);

    expect(generateId()).toBe(`ORD-${(1_752_000_000_000).toString(36).toUpperCase()}`);
  });
});