import { useEffect, useState } from 'react';
import type { Order } from '@/types/order';

export type OrdersSummaryMetrics = {
  activeOrdersCount: number;
  monthOrderCount: number;
  hydrated: boolean;
};

let sharedOrdersMetrics: OrdersSummaryMetrics = {
  activeOrdersCount: 0,
  monthOrderCount: 0,
  hydrated: false,
};

const ordersMetricsListeners = new Set<() => void>();

export function getOrdersSummaryMetrics() {
  return sharedOrdersMetrics;
}

export function publishOrdersSummaryMetrics(list: Array<Pick<Order, 'status' | 'created_at'>>) {
  const month = new Date().toISOString().slice(0, 7);
  const activeOrdersCount = list.filter((order) => !['delivered', 'cancelled'].includes(order.status)).length;
  const monthOrderCount = list.filter((order) => order.created_at.slice(0, 7) === month).length;

  sharedOrdersMetrics = {
    activeOrdersCount,
    monthOrderCount,
    hydrated: true,
  };
  ordersMetricsListeners.forEach((listener) => listener());
}

export function useOrdersSummaryState() {
  const [metrics, setMetrics] = useState<OrdersSummaryMetrics>(() => sharedOrdersMetrics);

  useEffect(() => {
    setMetrics(sharedOrdersMetrics);
    const handleUpdate = () => setMetrics(sharedOrdersMetrics);
    ordersMetricsListeners.add(handleUpdate);
    return () => {
      ordersMetricsListeners.delete(handleUpdate);
    };
  }, []);

  return metrics;
}
