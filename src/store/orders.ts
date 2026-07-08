import { Order } from '@/types/order';

const STORAGE_KEY = 'meal_delivery_orders';

export function getOrders(): Order[] {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveOrders(orders: Order[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function addOrder(order: Order): void {
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
}

export function updateOrderStatus(id: string, status: Order['status']): void {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx !== -1) {
    orders[idx].status = status;
    saveOrders(orders);
  }
}

export function generateId(): string {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}
