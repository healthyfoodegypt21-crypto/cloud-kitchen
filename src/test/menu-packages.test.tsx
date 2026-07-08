import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPackages from '@/pages/MenuPackages';

const mockUseAuth = vi.fn();
const mockUseMenuCatalog = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/useMenuCatalog', () => ({
  useMenuCatalog: () => mockUseMenuCatalog(),
}));

const brands = [
  { id: 'brand-1', name: 'Healthy Food', color: '#22c55e' },
  { id: 'brand-2', name: 'Protein Box', color: '#f59e0b' },
];

const meals = [
  {
    id: 'meal-1',
    brand_id: 'brand-1',
    name: 'Chicken Teriyaki',
    category: 'chicken' as const,
    price: 180,
    protein: 30,
    carbs: 40,
    fat: 10,
    calories: 350,
    created_at: '2026-03-22T00:00:00.000Z',
    updated_at: '2026-03-22T00:00:00.000Z',
  },
  {
    id: 'meal-2',
    brand_id: 'brand-2',
    name: 'Beef Bowl',
    category: 'meat' as const,
    price: 220,
    protein: 38,
    carbs: 25,
    fat: 11,
    calories: 390,
    created_at: '2026-03-22T00:00:00.000Z',
    updated_at: '2026-03-22T00:00:00.000Z',
  },
];

const packages = [
  {
    id: 'pkg-1',
    brand_id: 'brand-1',
    name: 'Lean Week',
    days_count: 5,
    price: 900,
    created_at: '2026-03-22T00:00:00.000Z',
    updated_at: '2026-03-22T00:00:00.000Z',
    items: [
      {
        id: 'pkg-item-1',
        menu_item_id: 'meal-1',
        custom_meal_name: null,
        display_order: 0,
        label: 'Chicken Teriyaki',
        source: 'menu' as const,
      },
    ],
  },
  {
    id: 'pkg-2',
    brand_id: 'brand-2',
    name: 'Protein Stack',
    days_count: 6,
    price: 1200,
    created_at: '2026-03-22T00:00:00.000Z',
    updated_at: '2026-03-22T00:00:00.000Z',
    items: [
      {
        id: 'pkg-item-2',
        menu_item_id: 'meal-2',
        custom_meal_name: null,
        display_order: 0,
        label: 'Beef Bowl',
        source: 'menu' as const,
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MenuPackages', () => {
  it('filters meals and packages by selected brand', () => {
    mockUseAuth.mockReturnValue({ role: 'owner' });
    mockUseMenuCatalog.mockReturnValue({
      meals,
      packages,
      loading: false,
      storageMode: 'database',
      fallbackReason: '',
      loadError: null,
      refresh: vi.fn(),
      saveMeal: vi.fn(),
      deleteMeal: vi.fn(),
      savePackage: vi.fn(),
      deletePackage: vi.fn(),
      loadDemoCatalog: vi.fn(),
    });

    render(<MenuPackages brands={brands} />);

    expect(screen.getAllByText('Chicken Teriyaki').length).toBeGreaterThan(0);
    expect(screen.getByText('Lean Week')).toBeInTheDocument();
    expect(screen.queryAllByText('Beef Bowl')).toHaveLength(0);
    expect(screen.queryByText('Protein Stack')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Protein Box' }));

    expect(screen.getAllByText('Beef Bowl').length).toBeGreaterThan(0);
    expect(screen.getByText('Protein Stack')).toBeInTheDocument();
    expect(screen.queryAllByText('Chicken Teriyaki')).toHaveLength(0);
  });

  it('hides owner management actions for non-owner roles', () => {
    mockUseAuth.mockReturnValue({ role: 'call_center' });
    mockUseMenuCatalog.mockReturnValue({
      meals,
      packages,
      loading: false,
      storageMode: 'database',
      fallbackReason: '',
      loadError: null,
      refresh: vi.fn(),
      saveMeal: vi.fn(),
      deleteMeal: vi.fn(),
      savePackage: vi.fn(),
      deletePackage: vi.fn(),
      loadDemoCatalog: vi.fn(),
    });

    render(<MenuPackages brands={brands} />);

    expect(screen.queryByRole('button', { name: /إضافة وجبة/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إنشاء باقة/i })).not.toBeInTheDocument();
    expect(screen.getByText('عرض فقط')).toBeInTheDocument();
  });

  it('allows owner to create a package from menu meals and custom meals', async () => {
    const savePackage = vi.fn().mockResolvedValue(true);

    mockUseAuth.mockReturnValue({ role: 'owner' });
    mockUseMenuCatalog.mockReturnValue({
      meals,
      packages,
      loading: false,
      storageMode: 'database',
      fallbackReason: '',
      loadError: null,
      refresh: vi.fn(),
      saveMeal: vi.fn(),
      deleteMeal: vi.fn(),
      savePackage,
      deletePackage: vi.fn(),
      loadDemoCatalog: vi.fn(),
    });

    render(<MenuPackages brands={brands} />);

    fireEvent.click(screen.getByRole('button', { name: /إنشاء باقة/i }));

    const dialog = screen.getByRole('dialog');
    const textboxes = within(dialog).getAllByRole('textbox');
    const spinbuttons = within(dialog).getAllByRole('spinbutton');

    fireEvent.change(textboxes[0], { target: { value: 'Starter Pack' } });
    fireEvent.change(spinbuttons[0], { target: { value: '7' } });
    fireEvent.change(spinbuttons[1], { target: { value: '1450' } });

    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: /إضافة اسم يدوي/i }));
    fireEvent.change(within(dialog).getByPlaceholderText('اسم وجبة خارج المنيو'), { target: { value: 'Special Detox Soup' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء الباقة' }));

    await waitFor(() => {
      expect(savePackage).toHaveBeenCalledWith({
        brand_id: 'brand-1',
        days_count: 7,
        id: undefined,
        items: [
          { menu_item_id: 'meal-1' },
          { custom_meal_name: 'Special Detox Soup' },
        ],
        name: 'Starter Pack',
        price: 1450,
      });
    });
  });

  it('shows a local fallback notice when catalog tables are missing', () => {
    const refresh = vi.fn();
    const loadDemoCatalog = vi.fn();

    mockUseAuth.mockReturnValue({ role: 'owner' });
    mockUseMenuCatalog.mockReturnValue({
      meals: [],
      packages: [],
      loading: false,
      storageMode: 'local',
      fallbackReason: 'يتم تشغيل القسم بحفظ محلي مؤقت لحين تطبيق migration الخاصة بالمنيو والباقات على Supabase.',
      loadError: null,
      refresh,
      saveMeal: vi.fn(),
      deleteMeal: vi.fn(),
      savePackage: vi.fn(),
      deletePackage: vi.fn(),
      loadDemoCatalog,
    });

    render(<MenuPackages brands={brands} />);

    expect(screen.getByText('القسم يعمل الآن في وضع محلي مؤقت')).toBeInTheDocument();
    expect(screen.getAllByText(/حفظ محلي مؤقت/i).length).toBeGreaterThan(0);
    expect(loadDemoCatalog).toHaveBeenCalledWith('brand-1', 'Healthy Food');

    fireEvent.click(screen.getByRole('button', { name: /تحديث/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('filters the visible catalog using the search box', () => {
    mockUseAuth.mockReturnValue({ role: 'owner' });
    mockUseMenuCatalog.mockReturnValue({
      meals,
      packages,
      loading: false,
      storageMode: 'database',
      fallbackReason: '',
      loadError: null,
      refresh: vi.fn(),
      saveMeal: vi.fn(),
      deleteMeal: vi.fn(),
      savePackage: vi.fn(),
      deletePackage: vi.fn(),
      loadDemoCatalog: vi.fn(),
    });

    render(<MenuPackages brands={brands} />);

    fireEvent.change(screen.getByPlaceholderText('ابحث باسم وجبة أو باقة أو مكون داخل الباقة'), {
      target: { value: 'Lean' },
    });

    expect(screen.getByText('Lean Week')).toBeInTheDocument();
    expect(screen.queryByText('Protein Stack')).not.toBeInTheDocument();
  });

  it('lets the owner trigger a full demo catalog for the selected brand', () => {
    const loadDemoCatalog = vi.fn();

    mockUseAuth.mockReturnValue({ role: 'owner' });
    mockUseMenuCatalog.mockReturnValue({
      meals,
      packages,
      loading: false,
      storageMode: 'local',
      fallbackReason: 'local mode',
      loadError: null,
      refresh: vi.fn(),
      saveMeal: vi.fn(),
      deleteMeal: vi.fn(),
      savePackage: vi.fn(),
      deletePackage: vi.fn(),
      loadDemoCatalog,
    });

    render(<MenuPackages brands={brands} />);

    fireEvent.click(screen.getByRole('button', { name: /تحميل نموذج كامل/i }));

    expect(loadDemoCatalog).toHaveBeenCalledWith('brand-1', 'Healthy Food');
  });

  it('treats demo mode as read-only even for owner role', () => {
    mockUseAuth.mockReturnValue({ role: 'owner', isDemoMode: true });
    mockUseMenuCatalog.mockReturnValue({
      meals,
      packages,
      loading: false,
      storageMode: 'local',
      fallbackReason: 'يتم تشغيل القسم محليًا.',
      loadError: null,
      refresh: vi.fn(),
      saveMeal: vi.fn(),
      deleteMeal: vi.fn(),
      savePackage: vi.fn(),
      deletePackage: vi.fn(),
      loadDemoCatalog: vi.fn(),
    });

    render(<MenuPackages brands={brands} />);

    expect(screen.getByText('الوضع التجريبي غير إداري')).toBeInTheDocument();
    expect(screen.getByText('عرض فقط')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إضافة وجبة/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إنشاء باقة/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تحميل نموذج كامل/i })).not.toBeInTheDocument();
  });
});