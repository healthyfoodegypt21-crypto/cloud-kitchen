import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import KitchenOrderAssemblyPrintSheet from '@/components/KitchenOrderAssemblyPrintSheet';
import KitchenOrderAssemblyTab from '@/components/KitchenOrderAssemblyTab';
import {
  buildKitchenOrderAssemblyReport,
  UNASSIGNED_COMPANY_LABEL,
} from '@/lib/kitchenOrderAssembly';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

const brands = [
  { id: 'brand-z', name: 'Protein Box', color: '#3b82f6' },
  { id: 'brand-a', name: 'Healthy Food', color: '#10b981' },
];

const meals: Meal[] = [
  {
    id: 'm1',
    brand_id: 'brand-a',
    name: 'Chicken Teriyaki',
    category: 'chicken',
    price: 220,
    protein: 38,
    carbs: 45,
    fat: 10,
    calories: 430,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'm2',
    brand_id: 'brand-a',
    name: 'Beef Steak',
    category: 'meat',
    price: 260,
    protein: 42,
    carbs: 40,
    fat: 12,
    calories: 460,
    created_at: '',
    updated_at: '',
  },
];

const packages: PackagePlan[] = [];

function createOrder(partial: Partial<Order> & { id: string }): Order {
  return {
    order_number: `ORD-${partial.id}`,
    customer_name: 'عميل',
    phone: '01000000000',
    phone_secondary: '',
    address: 'القاهرة',
    address_house_number: '',
    address_street: '',
    address_area: '',
    address_floor: '',
    address_apartment: '',
    execution_date: '2026-11-15',
    order_mode: 'meals',
    package: '',
    package_plan_id: null,
    meal_type: 'lunch',
    notes: '',
    status: 'confirmed',
    created_at: '2026-11-15T08:00:00.000Z',
    price: 300,
    selected_meal_ids: [],
    source: 'other',
    brand_id: 'brand-a',
    created_by: null,
    ...partial,
  };
}

describe('kitchenOrderAssembly', () => {
  it('excludes cancelled orders, sorts companies & customers alphabetically, and places unassigned orders last', () => {
    const orders: Order[] = [
      createOrder({
        id: '1',
        brand_id: 'brand-z',
        customer_name: 'ياسر محمود',
        imported_meal_details: ['Beef Steak', 'Beef Steak'],
      }),
      createOrder({
        id: '2',
        brand_id: 'brand-a',
        customer_name: 'زيد طارق',
        selected_meal_ids: ['m1'],
        notes: 'بدون معالق بلاستيك',
      }),
      createOrder({
        id: '3',
        brand_id: 'brand-a',
        customer_name: 'أحمد سامي',
        selected_meal_ids: ['m1', 'm2'],
        meal_customizations: [{ key: 'm2', label: 'Beef Steak', notes: 'بدون أرز' }],
      }),
      createOrder({
        id: '4',
        brand_id: null,
        customer_name: 'كريم فردي',
        imported_meal_details: ['Chicken Teriyaki'],
      }),
      createOrder({
        id: '5',
        brand_id: 'brand-a',
        customer_name: 'ملغي لا يظهر',
        status: 'cancelled',
        selected_meal_ids: ['m1'],
      }),
    ];

    const report = buildKitchenOrderAssemblyReport({
      orders,
      brands,
      meals,
      packages,
      date: '2026-11-15',
    });

    // Companies sorted alphabetically: Healthy Food -> Protein Box -> عملاء أفراد / بدون شركة
    expect(report.companies.map((c) => c.companyName)).toEqual([
      'Healthy Food',
      'Protein Box',
      UNASSIGNED_COMPANY_LABEL,
    ]);
    expect(report.totalCustomerOrders).toBe(4);
    expect(report.totalMeals).toBe(6);

    // Customers inside Healthy Food sorted alphabetically: أحمد سامي -> زيد طارق
    const hf = report.companies[0];
    expect(hf.orders.map((o) => o.customerName)).toEqual(['أحمد سامي', 'زيد طارق']);
    expect(hf.customerCount).toBe(2);
    expect(hf.totalMealCount).toBe(3);

    // Company Item Summary for Healthy Food sorted alphabetically: Beef Steak (1), Chicken Teriyaki (2)
    expect(hf.itemSummary.map((i) => ({ label: i.label, qty: i.totalQuantity }))).toEqual([
      { label: 'Beef Steak', qty: 1 },
      { label: 'Chicken Teriyaki', qty: 2 },
    ]);

    // Meal customization & order notes captured for QC highlighting
    expect(hf.orders[0].notes).toEqual([
      expect.objectContaining({ scope: 'meal', mealLabel: 'Beef Steak', text: 'بدون أرز' }),
    ]);
    expect(hf.orders[1].notes).toEqual([
      expect.objectContaining({ scope: 'order', text: 'بدون معالق بلاستيك' }),
    ]);
  });

  it('filters by company and quick search (customer name or item name)', () => {
    const orders: Order[] = [
      createOrder({ id: '1', brand_id: 'brand-a', customer_name: 'سارة علي', selected_meal_ids: ['m1'] }),
      createOrder({ id: '2', brand_id: 'brand-a', customer_name: 'محمد نبيل', selected_meal_ids: ['m2'] }),
      createOrder({ id: '3', brand_id: 'brand-z', customer_name: 'سارة حسن', selected_meal_ids: ['m2'] }),
    ];

    const filteredBySearch = buildKitchenOrderAssemblyReport({
      orders,
      brands,
      meals,
      packages,
      date: '2026-11-15',
      searchQuery: 'Chicken Teriyaki',
    });
    expect(filteredBySearch.totalCustomerOrders).toBe(1);
    expect(filteredBySearch.companies[0].orders[0].customerName).toBe('سارة علي');

    const filteredByCompany = buildKitchenOrderAssemblyReport({
      orders,
      brands,
      meals,
      packages,
      date: '2026-11-15',
      companyFilter: 'brand-z',
    });
    expect(filteredByCompany.companies).toHaveLength(1);
    expect(filteredByCompany.companies[0].companyName).toBe('Protein Box');
  });

  it('renders interactive QC checkboxes, print buttons, and printable multi-company pages', () => {
    localStorage.clear();
    const orders: Order[] = [
      createOrder({ id: 'ord-qc-1', brand_id: 'brand-a', customer_name: 'مروان خالد', selected_meal_ids: ['m1'] }),
    ];
    const report = buildKitchenOrderAssemblyReport({
      orders,
      brands,
      meals,
      packages,
      date: '2026-11-15',
    });

    const onPrintAll = vi.fn();
    const onPrintSingle = vi.fn();

    render(
      <>
        <KitchenOrderAssemblyTab
          selectedDate="2026-11-15"
          onSelectedDateChange={vi.fn()}
          selectedCompanyFilter="all"
          onSelectedCompanyFilterChange={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          brands={brands}
          report={report}
          loading={false}
          onPrintAll={onPrintAll}
          onPrintSingleCompany={onPrintSingle}
        />
        <KitchenOrderAssemblyPrintSheet
          companies={report.companies}
          dateLabel="15 نوفمبر 2026"
          weekdayLabel="الأحد"
        />
      </>,
    );

    const qcBox = screen.getByRole('checkbox', { name: 'مراجعة طلب مروان خالد' });
    expect(qcBox).not.toBeChecked();
    fireEvent.click(qcBox);
    expect(qcBox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /طباعة كشف هذه الشركة فقط/i }));
    expect(onPrintSingle).toHaveBeenCalledWith('brand-a');

    fireEvent.click(screen.getByRole('button', { name: /طباعة كل الكشوفات/i }));
    expect(onPrintAll).toHaveBeenCalledOnce();

    expect(screen.getByLabelText('مربع مراجعة مطبوع')).toBeInTheDocument();
  });
});
