import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '@/components/AppLayout';

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
});