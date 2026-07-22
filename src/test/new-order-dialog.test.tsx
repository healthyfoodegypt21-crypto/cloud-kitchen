import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewOrderDialog from '@/components/NewOrderDialog';

const mockUseAuth = vi.fn();
const mockUseBrands = vi.fn();
const mockUseMenuCatalog = vi.fn();
const mockUseCustomers = vi.fn();
const mockUseIsMobile = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/useBrands', () => ({
  useBrands: () => mockUseBrands(),
}));

vi.mock('@/hooks/useMenuCatalog', () => ({
  useMenuCatalog: () => mockUseMenuCatalog(),
}));

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => mockUseCustomers(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

describe('NewOrderDialog brand selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockUseMenuCatalog.mockReturnValue({ meals: [], packages: [] });
    mockUseCustomers.mockReturnValue({
      customers: [],
      loading: false,
      storageMode: 'customers',
      upsertCustomer: vi.fn(),
    });
    mockUseIsMobile.mockReturnValue(false);
  });

  it('shows the assigned brand automatically when only one brand is accessible', async () => {
    mockUseBrands.mockReturnValue({
      brands: [{ id: 'brand-1', name: 'Healthy Food', color: '#22c55e' }],
    });

    render(<NewOrderDialog onCreated={vi.fn()} addOrder={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /إضافة أوردر جديد/i }));

    expect(screen.getByText('البراند المرتبط بحسابك')).toBeInTheDocument();
    expect(screen.getByText('Healthy Food')).toBeInTheDocument();
    expect(screen.queryByText('اختر البراند أولًا')).not.toBeInTheDocument();
    expect(screen.queryByText('اختر العلامة')).not.toBeInTheDocument();
  });

  it('keeps brand selection visible when the user can access multiple brands', async () => {
    mockUseBrands.mockReturnValue({
      brands: [
        { id: 'brand-1', name: 'Healthy Food', color: '#22c55e' },
        { id: 'brand-2', name: 'Healthy Station', color: '#3b82f6' },
      ],
    });

    render(<NewOrderDialog onCreated={vi.fn()} addOrder={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /إضافة أوردر جديد/i }));

    expect(screen.getByText('اختر البراند أولًا')).toBeInTheDocument();
    expect(screen.getByText('اختر العلامة')).toBeInTheDocument();
  });
});
