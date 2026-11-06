import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UsersManagement from '@/pages/UsersManagement';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: { resetPasswordForEmail: vi.fn() },
  },
}));

vi.mock('@/hooks/useBrands', () => ({
  useBrands: () => ({
    brands: [{ id: 'brand-a', name: 'Healthy Food', color: '#22c55e' }],
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'admin-user' } }),
}));

vi.mock('@/hooks/useSupabaseRealtimeRefresh', () => ({
  useSupabaseRealtimeRefresh: vi.fn(),
}));

vi.mock('@/integrationssupabase/runtime', () => ({
  isSupabaseNetworkError: () => false,
  isSupabaseUnavailable: () => false,
  markSupabaseUnavailable: vi.fn(),
}));

const userRows = [
  {
    id: 'user-ahmed',
    name: 'Ahmed Ali',
    email: 'ahmed@example.com',
    phone: '+201000000001',
    role: 'cashier',
    brands: ['brand-a'],
    branches: ['hub-one'],
    pages: ['dashboard', 'orders'],
    status: 'active',
    last_login: '2026-11-06T12:00:00.000Z',
    created_at: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'user-sara',
    name: 'Sara Hassan',
    email: 'sara@example.com',
    phone: '+201000000002',
    role: 'chef',
    brands: ['brand-a'],
    branches: ['hub-one'],
    pages: ['kitchen'],
    status: 'inactive',
    last_login: null,
    created_at: '2026-10-02T10:00:00.000Z',
  },
];

describe('UsersManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({
      data: {
        users: userRows,
        hubs: [{ id: 'hub-one', name: 'مطبخ مدينة نصر', is_active: true }],
      },
      error: null,
    });
  });

  it('renders the user table with contact, role, assignment, and status information', async () => {
    render(<UsersManagement />);

    expect(await screen.findByText('Ahmed Ali')).toBeInTheDocument();
    expect(screen.getByText('ahmed@example.com')).toBeInTheDocument();
    expect(screen.getByText('كاشير وإغلاق')).toBeInTheDocument();
    expect(screen.getAllByText('مطبخ مدينة نصر').length).toBeGreaterThan(0);
    expect(screen.getByText('نشط')).toBeInTheDocument();
    expect(screen.getByText('معطل')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('debounces employee search and offers a way to clear an empty result', async () => {
    render(<UsersManagement />);

    expect(await screen.findByText('Ahmed Ali')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن مستخدم' }), {
      target: { value: 'sara@example.com' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Ahmed Ali')).not.toBeInTheDocument();
      expect(screen.getByText('Sara Hassan')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن مستخدم' }), {
      target: { value: 'does-not-exist' },
    });
    expect(await screen.findByText('لا توجد نتائج مطابقة')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'مسح البحث والفلاتر' }));
    expect(await screen.findByText('Ahmed Ali')).toBeInTheDocument();
  });
});
