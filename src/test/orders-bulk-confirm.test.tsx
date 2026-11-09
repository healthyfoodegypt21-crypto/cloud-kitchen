import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Orders from '@/pages/Orders';
import { getTodayDateValue } from '@/lib/utils';
import type { Order } from '@/types/order';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role: 'call_center' }) }));
vi.mock('@/components/OrderCard', () => ({ default: () => null }));
vi.mock('@/components/NewOrderDialog', () => ({ default: () => null }));
vi.mock('@/components/OrderSheetImportDialog', () => ({ default: () => null }));
vi.mock('@/components/InvoicePrintSheet', () => ({ default: () => null }));

function createOrder(id: string, status: Order['status']): Order {
  return {
    id,
    order_number: id,
    customer_name: id,
    phone: '01012345678',
    phone_secondary: '',
    address: 'القاهرة',
    address_house_number: '',
    address_street: '',
    address_area: '',
    address_floor: '',
    address_apartment: '',
    execution_date: getTodayDateValue(),
    order_mode: 'meals',
    package: '',
    package_plan_id: null,
    meal_type: 'lunch',
    notes: '',
    status,
    created_at: new Date().toISOString(),
    price: 250,
    selected_meal_ids: [],
    source: 'other',
    brand_id: 'brand-1',
    created_by: null,
  };
}

describe('Orders bulk confirmation', () => {
  it('confirms all new visible orders together without changing other statuses', async () => {
    const updateOrdersStatus = vi.fn().mockResolvedValue(true);
    render(
      <Orders
        orders={[
          createOrder('new-1', 'new'),
          createOrder('new-2', 'new'),
          createOrder('already-confirmed', 'confirmed'),
        ]}
        loading={false}
        onRefresh={vi.fn()}
        addOrder={vi.fn().mockResolvedValue(true)}
        saveImportedOrder={vi.fn().mockResolvedValue('imported')}
        updateOrder={vi.fn().mockResolvedValue(true)}
        updateOrdersStatus={updateOrdersStatus}
        updateStatus={vi.fn().mockResolvedValue(undefined)}
        seedDemoOrders={vi.fn().mockResolvedValue(true)}
        brands={[]}
        meals={[]}
        packages={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /تأكيد الطلبات الجديدة المعروضة \(2\)/i }));
    expect(await screen.findByText(/سيتم نقل 2 طلب جديد ظاهر/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الكل' }));

    await waitFor(() => expect(updateOrdersStatus).toHaveBeenCalledWith(['new-1', 'new-2'], 'confirmed'));
  });
});
