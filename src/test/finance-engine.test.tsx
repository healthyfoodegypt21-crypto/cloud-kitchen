import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceNextDueDate,
  buildDefaultLocalCategories,
  calculateBrandAllocations,
  computeFinancialPnL,
  generateCostSavingInsights,
} from '@/lib/financeEngine';
import type { Brand, Order } from '@/types/order';
import type { ExpenseRecord } from '@/types/finance';

// Mock hooks so UI rendering works cleanly in CI without Supabase env vars
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    role: 'owner',
    displayName: 'Maikel',
    isDemoMode: false,
    pagePermissions: [],
    signOut: vi.fn(),
  }),
}));

const sampleBrands: Brand[] = [
  {
    id: 'b1',
    name: 'Healthy Fit',
    slug: 'healthy-fit',
    color: '#10b981',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  } as Brand,
  {
    id: 'b2',
    name: 'Keto Pro',
    slug: 'keto-pro',
    color: '#0284c7',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  } as Brand,
];

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'ord-1',
  order_number: 'ORD-101',
  customer_name: 'أحمد علي',
  phone: '01012345678',
  phone_secondary: '',
  address: 'مدينة نصر',
  address_house_number: '',
  address_street: '',
  address_area: '',
  address_floor: '',
  address_apartment: '',
  execution_date: '2026-11-10',
  order_mode: 'package',
  package: 'باقة شهرية',
  package_plan_id: null,
  meal_type: 'lunch',
  notes: '',
  status: 'delivered',
  created_at: '2026-11-10T10:00:00Z',
  price: 3000,
  selected_meal_ids: ['m1'],
  source: 'facebook',
  brand_id: 'b1',
  created_by: null,
  ...overrides,
});

describe('Multi-Brand Allocation Engine & P&L', () => {
  it('allocates direct, shared_revenue, shared_orders, and fixed_percent accurately', () => {
    const orders: Order[] = [
      makeOrder({ id: 'o1', brand_id: 'b1', price: 3000 }),
      makeOrder({ id: 'o2', brand_id: 'b2', price: 1000 }),
    ];

    // 1. Direct (100% to b1)
    const direct = calculateBrandAllocations({
      expenseId: 'exp-1',
      totalAmount: 1500,
      expenseDate: '2026-11-10',
      allocationType: 'direct',
      directCompanyId: 'b1',
      brands: sampleBrands,
      orders,
    });
    expect(direct).toHaveLength(1);
    expect(direct[0]).toMatchObject({ company_id: 'b1', allocated_amount: 1500, percentage: 100 });

    // 2. Shared by revenue (75% b1, 25% b2)
    const byRev = calculateBrandAllocations({
      expenseId: 'exp-2',
      totalAmount: 2000,
      expenseDate: '2026-11-10',
      allocationType: 'shared_revenue',
      brands: sampleBrands,
      orders,
    });
    expect(byRev.find((x) => x.company_id === 'b1')?.allocated_amount).toBe(1500);
    expect(byRev.find((x) => x.company_id === 'b2')?.allocated_amount).toBe(500);

    // 3. Shared by orders (1 order each => 50% / 50%)
    const byOrders = calculateBrandAllocations({
      expenseId: 'exp-3',
      totalAmount: 1000,
      expenseDate: '2026-11-10',
      allocationType: 'shared_orders',
      brands: sampleBrands,
      orders,
    });
    expect(byOrders.find((x) => x.company_id === 'b1')?.allocated_amount).toBe(500);
    expect(byOrders.find((x) => x.company_id === 'b2')?.allocated_amount).toBe(500);

    // 4. Fixed percent (60% / 40%)
    const byFixed = calculateBrandAllocations({
      expenseId: 'exp-4',
      totalAmount: 1000,
      expenseDate: '2026-11-10',
      allocationType: 'fixed_percent',
      fixedPercentages: { b1: 60, b2: 40 },
      brands: sampleBrands,
      orders,
    });
    expect(byFixed.find((x) => x.company_id === 'b1')?.allocated_amount).toBe(600);
    expect(byFixed.find((x) => x.company_id === 'b2')?.allocated_amount).toBe(400);
  });

  it('excludes CapEx from operating profit margin while tracking it in cash flow', () => {
    const categories = buildDefaultLocalCategories();
    const cogsCat = categories.find((c) => c.slug === 'cogs-protein')!;
    const capexCat = categories.find((c) => c.slug === 'capex-equipment')!;

    const orders: Order[] = [
      makeOrder({ id: 'o1', brand_id: 'b1', price: 10000, execution_date: '2026-11-10' }),
    ];

    const expenses: ExpenseRecord[] = [
      {
        id: 'e1',
        title: 'صدور دجاج',
        amount: 3000,
        tax_amount: 0,
        expense_date: '2026-11-05',
        category_id: cogsCat.id,
        brand_id: null,
        source_type: 'purchase',
        source_ref_id: null,
        payment_method: 'cash',
        payment_status: 'paid',
        receipt_url: null,
        notes: '',
        created_by: null,
        created_at: '2026-11-05T10:00:00Z',
        allocations: [],
      },
      {
        id: 'e2',
        title: 'شراء فرن كونفكشن صناعي',
        amount: 25000,
        tax_amount: 0,
        expense_date: '2026-11-06',
        category_id: capexCat.id,
        brand_id: null,
        source_type: 'manual',
        source_ref_id: null,
        payment_method: 'bank_transfer',
        payment_status: 'paid',
        receipt_url: null,
        notes: '',
        created_by: null,
        created_at: '2026-11-06T10:00:00Z',
        allocations: [],
      },
    ];

    const pnl = computeFinancialPnL({
      expenses,
      categories,
      orders,
      brands: sampleBrands,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });

    expect(pnl.totalRevenue).toBe(10000);
    expect(pnl.totalOpex).toBe(3000);
    expect(pnl.totalCapex).toBe(25000);
    // Operating profit ignores the 25,000 CapEx oven so margin isn't distorted
    expect(pnl.netOperatingProfit).toBe(7000);
    expect(pnl.operatingMarginPct).toBe(70);
    // Cash flow includes CapEx
    expect(pnl.netCashFlow).toBe(-18000);
  });
});

describe('5-Rule Cost-Saving Intelligence Engine', () => {
  it('triggers alerts across supplier creep, food cost gap, ads ROAS, cancelled bleed, and utility spike', () => {
    const categories = buildDefaultLocalCategories();
    const adsCat = categories.find((c) => c.slug === 'marketing-sponsored-ads')!;
    const elecCat = categories.find((c) => c.slug === 'facility-electricity')!;

    const orders: Order[] = [
      // Previous month orders
      makeOrder({ id: 'p1', brand_id: 'b1', price: 2000, execution_date: '2026-10-10' }),
      makeOrder({ id: 'p2', brand_id: 'b1', price: 2000, execution_date: '2026-10-15' }),
      // Current month orders (1 delivered + 1 cancelled)
      makeOrder({ id: 'c1', brand_id: 'b1', price: 1000, execution_date: '2026-11-10', selected_meal_ids: ['m1'] }),
      makeOrder({ id: 'c2', brand_id: 'b1', price: 800, execution_date: '2026-11-12', status: 'cancelled' }),
    ];

    const expenses: ExpenseRecord[] = [
      // High ad spend on b1 (ROAS < 3)
      {
        id: 'ad-1',
        title: 'إسبونسر فيسبوك',
        amount: 600,
        tax_amount: 0,
        expense_date: '2026-11-05',
        category_id: adsCat.id,
        brand_id: 'b1',
        source_type: 'manual',
        source_ref_id: null,
        payment_method: 'card',
        payment_status: 'paid',
        receipt_url: null,
        notes: '',
        created_by: null,
        created_at: '2026-11-05T00:00:00Z',
        allocations: [
          {
            id: 'al-1',
            expense_id: 'ad-1',
            company_id: 'b1',
            allocation_type: 'direct',
            allocated_amount: 600,
            percentage: 100,
          },
        ],
      },
      // Previous month electricity (200 EGP for 2 orders = 100/order)
      {
        id: 'el-oct',
        title: 'كهرباء أكتوبر',
        amount: 200,
        tax_amount: 0,
        expense_date: '2026-10-25',
        category_id: elecCat.id,
        brand_id: null,
        source_type: 'recurring',
        source_ref_id: null,
        payment_method: 'cash',
        payment_status: 'paid',
        receipt_url: null,
        notes: '',
        created_by: null,
        created_at: '2026-10-25T00:00:00Z',
        allocations: [],
      },
      // Current month electricity jump (300 EGP for 1 order = 300/order => +200% spike)
      {
        id: 'el-nov',
        title: 'كهرباء نوفمبر',
        amount: 300,
        tax_amount: 0,
        expense_date: '2026-11-25',
        category_id: elecCat.id,
        brand_id: null,
        source_type: 'recurring',
        source_ref_id: null,
        payment_method: 'cash',
        payment_status: 'paid',
        receipt_url: null,
        notes: '',
        created_by: null,
        created_at: '2026-11-25T00:00:00Z',
        allocations: [],
      },
    ];

    const insights = generateCostSavingInsights({
      expenses,
      categories,
      orders,
      brands: sampleBrands,
      meals: [
        {
          id: 'm1',
          brand_id: 'b1',
          name: 'وجبة دجاج مشوي',
          category: 'lunch',
          price: 200,
          calories: 450,
          protein: 40,
          carbs: 30,
          fat: 10,
          is_active: true,
          ingredients: [
            {
              id: 'ing-link-1',
              ingredient_id: null,
              name: 'صدور دجاج',
              weight_before_grams: 250,
              weight_after_grams: 200,
            },
          ],
        } as never,
      ],
      packages: [],
      inventoryItems: [
        { id: 'inv-1', name: 'صدور دجاج', usageUnit: 'kg', avgCostPerUsageUnit: 200 },
      ],
      purchaseHistory: [
        // 4 invoices: latest is 240 EGP vs avg of previous 3 (180 EGP) => +33.3% > 5%
        { itemId: 'inv-1', itemName: 'صدور دجاج', supplierName: 'مورد الغالي', unitCost: 240, purchasedAt: '2026-11-12T10:00:00Z' },
        { itemId: 'inv-1', itemName: 'صدور دجاج', supplierName: 'مورد الجملة الأفضل', unitCost: 180, purchasedAt: '2026-11-05T10:00:00Z' },
        { itemId: 'inv-1', itemName: 'صدور دجاج', supplierName: 'مورد الجملة الأفضل', unitCost: 180, purchasedAt: '2026-10-25T10:00:00Z' },
        { itemId: 'inv-1', itemName: 'صدور دجاج', supplierName: 'مورد الجملة الأفضل', unitCost: 180, purchasedAt: '2026-10-15T10:00:00Z' },
      ],
      // Theoretical cost for 1 meal = 0.25 * 200 = 50 (5% of 1000 revenue), actual usage = 400 (40% of 1000 revenue) => +35% gap > 3%
      actualWithdrawalsPlusWasteCost: 400,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });

    const rulesTriggered = new Set(insights.map((i) => i.rule));
    expect(rulesTriggered.has('supplier_price_creep')).toBe(true);
    expect(rulesTriggered.has('food_cost_gap')).toBe(true);
    expect(rulesTriggered.has('ad_efficiency')).toBe(true);
    expect(rulesTriggered.has('cancelled_orders_bleed')).toBe(true);
    expect(rulesTriggered.has('labor_utility_spike')).toBe(true);

    // Check alternative supplier recommendation in Rule 1
    const creepAlert = insights.find((i) => i.rule === 'supplier_price_creep')!;
    expect(creepAlert.description).toContain('مورد الجملة الأفضل');
  });

  it('advances recurring due dates accurately across monthly, weekly, and yearly schedules', () => {
    expect(advanceNextDueDate('2026-11-05', 'monthly', 5)).toBe('2026-12-05');
    expect(advanceNextDueDate('2026-11-05', 'weekly', 5)).toBe('2026-11-12');
    expect(advanceNextDueDate('2026-11-05', 'yearly', 5)).toBe('2027-11-05');
  });
});

describe('Sidebar Finance Navigation', () => {
  it(
    'renders المالية والمحاسبة links in AppLayout',
    async () => {
      vi.mock('@/hooks/useOrders', () => ({
        hydrateOrdersSummaryMetrics: vi.fn(),
        useOrders: () => ({ orders: [], loading: false }),
      }));
      const { default: AppLayout } = await import('@/components/AppLayout');
      render(
        <MemoryRouter initialEntries={['/expenses']}>
          <AppLayout>
            <div>محتوى المالية</div>
          </AppLayout>
        </MemoryRouter>,
      );

      expect(screen.getByText('المالية والمحاسبة')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /المصروفات والتحليل المالي/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /الالتزامات والفواتير المتكررة/i })).toBeInTheDocument();
    },
    15000,
  );
});
