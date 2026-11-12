import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '@/components/AppLayout';
import Dashboard from '@/pages/Dashboard';
import { formatEGPCurrency } from '@/lib/utils';
import type { Order } from '@/types/order';

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides administrative navigation in demo mode', () => {
    mockUseAuth.mockReturnValue({
      role: 'owner',
      displayName: 'مالك تجريبي',
      pagePermissions: [],
      signOut: vi.fn(),
      isDemoMode: true,
    });

    render(
      <MemoryRouter initialEntries={['/orders']}>
        <AppLayout><div>content</div></AppLayout>
      </MemoryRouter>
    );

    expect(screen.getByText('وضع تجريبي محلي بصلاحيات غير تشغيلية')).toBeInTheDocument();
    expect(screen.getByText('نظرة عامة')).toBeInTheDocument();
    expect(screen.getByText('التشغيل والمطبخ')).toBeInTheDocument();
    expect(screen.getByText('متصل الآن')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /لوحة التحكم/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الطلبات/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /المخزون/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /المنيو والباقات/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /المستخدمون/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /الإعدادات/i })).not.toBeInTheDocument();
  });

  it('respects stored page permissions for non-owner users', () => {
    mockUseAuth.mockReturnValue({
      role: 'call_center',
      displayName: 'موظف',
      pagePermissions: ['dashboard', 'orders', 'customers'],
      signOut: vi.fn(),
      isDemoMode: false,
    });

    render(
      <MemoryRouter initialEntries={['/orders']}>
        <AppLayout><div>content</div></AppLayout>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /لوحة التحكم/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /الطلبات/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /العملاء/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /لوحة الصدارة/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /المنيو والباقات/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /الإعدادات/i })).not.toBeInTheDocument();
  });

  it('renders Western Arabic digits across currency metrics and Dashboard cards', () => {
    expect(formatEGPCurrency(81174)).toBe('81,174 ج.م.');
    expect(formatEGPCurrency(0)).toBe('0 ج.م.');

    const monthPrefix = new Date().toISOString().slice(0, 7);
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const sampleOrder: Order = {
      id: 'ord-1',
      order_number: 'ORD-1',
      customer_name: 'عميل',
      phone: '01000000000',
      phone_secondary: '',
      address: 'القاهرة',
      address_house_number: '',
      address_street: '',
      address_area: '',
      address_floor: '',
      address_apartment: '',
      execution_date: `${monthPrefix}-01`,
      order_mode: 'package',
      package: 'باقة',
      package_plan_id: null,
      meal_type: 'lunch',
      notes: '',
      status: 'confirmed',
      created_at: eightHoursAgo.startsWith(monthPrefix) ? eightHoursAgo : `${monthPrefix}-01T01:00:00.000Z`,
      price: 81174,
      selected_meal_ids: [],
      source: 'other',
      brand_id: null,
      created_by: null,
    };

    const { container } = render(
      <Dashboard
        orders={[sampleOrder]}
        brands={[]}
        getTarget={() => 100000}
      />
    );

    expect(container.textContent).toContain('81,174 ج.م.');
    expect(container.textContent).not.toMatch(/[٠-٩]/);
  });
});