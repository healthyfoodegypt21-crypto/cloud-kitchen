import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    role: 'owner',
    displayName: 'Maikel',
    pagePermissions: [],
    isDemoMode: false,
    signOut: vi.fn(),
  }),
}));

import Customers from '@/pages/Customers';
import {
  buildCustomer360Insights,
  buildSmartWhatsAppMessage,
  buildWhatsAppUrl,
  formatWhatsAppPhone,
  getRecommendedTemplateForSegment,
} from '@/lib/customerCrm';
import type { Customer } from '@/types/customer';
import type { Order } from '@/types/order';

const sampleBrand = { id: 'brand-1', name: 'Healthy Food', color: '#10b981' };

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: 'cust-1',
    brand_id: 'brand-1',
    name: 'أحمد سمير',
    phone: '01012345678',
    phone_secondary: '01122334455',
    address: 'مدينة نصر - شارع عباس العقاد',
    address_house_number: '10',
    address_street: 'عباس العقاد',
    address_area: 'مدينة نصر',
    address_floor: '3',
    address_apartment: '8',
    notes: 'بدون بصل',
    created_at: twentyDaysAgo,
    updated_at: twentyDaysAgo,
    last_order_at: twentyDaysAgo,
    order_count: 3,
    record_source: 'customers',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: 'ord-1',
    order_number: 'ORD-101',
    customer_name: 'أحمد سمير',
    phone: '01012345678',
    phone_secondary: '',
    address: 'مدينة نصر - شارع عباس العقاد',
    address_house_number: '10',
    address_street: 'عباس العقاد',
    address_area: 'مدينة نصر',
    address_floor: '3',
    address_apartment: '8',
    execution_date: '2026-10-20',
    order_mode: 'package',
    package: 'باقة الدايت الأسبوعية',
    package_plan_id: null,
    meal_type: 'lunch',
    notes: 'التوصيل قبل 2 ظهراً',
    status: 'delivered',
    created_at: twentyDaysAgo,
    price: 1200,
    selected_meal_ids: [],
    imported_meal_details: ['Grilled Chicken', 'Beef Steak'],
    source: 'instagram',
    brand_id: 'brand-1',
    created_by: null,
    ...overrides,
  };
}

describe('customerCrm helpers', () => {
  it('formats Egyptian local and international phone numbers for wa.me', () => {
    expect(formatWhatsAppPhone('0101 234-5678')).toBe('201012345678');
    expect(formatWhatsAppPhone('1012345678')).toBe('201012345678');
    expect(formatWhatsAppPhone('+20 112 233 4455')).toBe('201122334455');
    expect(formatWhatsAppPhone('00201234567890')).toBe('201234567890');
    expect(buildWhatsAppUrl('01012345678', 'مرحبا')).toBe(
      `https://wa.me/201012345678?text=${encodeURIComponent('مرحبا')}`,
    );
  });

  it('picks segment-appropriate templates and uses Western digits', () => {
    expect(getRecommendedTemplateForSegment('at_risk')).toBe('winback');
    expect(getRecommendedTemplateForSegment('vip')).toBe('vip_care');
    expect(getRecommendedTemplateForSegment('new')).toBe('welcome_feedback');
    expect(getRecommendedTemplateForSegment('repeat')).toBe('renewal');

    const vipMsg = buildSmartWhatsAppMessage({
      templateId: 'vip_care',
      customerName: 'أحمد سمير',
      brandName: 'Healthy Food',
      orderCount: 8,
    });
    expect(vipMsg).toContain('أحمد');
    expect(vipMsg).toContain('Healthy Food');
    expect(vipMsg).toContain('8');
    expect(vipMsg).not.toMatch(/[٠-٩]/);
  });

  it('computes 360 customer LTV, cadence, favorite meals, and order history', () => {
    const customer = makeCustomer();
    const orders = [
      makeOrder({ id: 'ord-1', order_number: 'ORD-101', execution_date: '2026-10-20', price: 1200 }),
      makeOrder({ id: 'ord-2', order_number: 'ORD-100', execution_date: '2026-10-13', price: 800 }),
      makeOrder({ id: 'ord-3', order_number: 'ORD-099', execution_date: '2026-10-10', price: 500, status: 'cancelled' }),
    ];

    const insights = buildCustomer360Insights(customer, orders);
    expect(insights.validOrdersCount).toBe(2);
    expect(insights.cancelledOrdersCount).toBe(1);
    expect(insights.lifetimeValue).toBe(2000);
    expect(insights.averageOrderValue).toBe(1000);
    expect(insights.averageCadenceDays).toBe(7);
    expect(insights.favoritePackages[0]).toEqual({ label: 'باقة الدايت الأسبوعية', count: 2 });
    expect(insights.favoriteMeals.map((m) => m.label)).toContain('Grilled Chicken');
  });
});

describe('Customers page WhatsApp CRM + Customer 360 Drawer', () => {
  it('renders 1-Click WhatsApp actions and opens Customer 360 drawer with timeline and template switching', async () => {
    const customer = makeCustomer();
    const orders = [
      makeOrder({ id: 'ord-1', order_number: 'ORD-101', price: 1200 }),
      makeOrder({ id: 'ord-2', order_number: 'ORD-102', price: 950, execution_date: '2026-10-12' }),
    ];

    render(
      <Customers
        customers={[customer]}
        orders={orders}
        loading={false}
        brands={[sampleBrand]}
        storageMode="customers"
        onUpdateCustomer={vi.fn().mockResolvedValue(customer)}
      />,
    );

    // Direct 1-click WhatsApp link on card + hot recovery list
    const whatsappLinks = screen.getAllByRole('link', { name: /واتساب|استرجاع/i });
    expect(whatsappLinks.length).toBeGreaterThanOrEqual(2);
    expect(whatsappLinks[0].getAttribute('href')).toContain('https://wa.me/201012345678?text=');

    // Open Customer 360 Drawer
    fireEvent.click(screen.getByRole('button', { name: /ملف 360/i }));

    expect(await screen.findByText('منصة واتساب الذكية (1-Click WhatsApp CRM)')).toBeInTheDocument();
    expect(screen.getByText('سجل الطلبات الزمني الكامل')).toBeInTheDocument();
    expect(screen.getByText('ORD-101')).toBeInTheDocument();
    expect(screen.getByText('ORD-102')).toBeInTheDocument();
    expect(screen.getAllByText('2,150 ج.م.').length).toBeGreaterThan(0);

    // Switch WhatsApp template inside Drawer
    fireEvent.click(screen.getByRole('button', { name: /تجديد الباقة/i }));
    const textarea = screen.getByLabelText('نص رسالة واتساب') as HTMLTextAreaElement;
    expect(textarea.value).toContain('نذكرك بتجديد باقتك');
  });
});
