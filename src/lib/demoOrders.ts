import { Brand } from '@/hooks/useBrands';
import { buildDemoMealsForBrand, buildDemoPackagesForBrand } from '@/store/menuCatalog';
import { Order, OrderSource, OrderStatus } from '@/types/order';
import { compactWhitespace, formatDetailedAddress } from '@/lib/utils';

export const DEMO_ORDER_NUMBER_PREFIX = 'DMO-202603';
export const DEMO_ORDERS_STORAGE_KEY = 'cloud_kitchen_demo_orders';
export const DEMO_ORDERS_INITIALIZED_KEY = 'cloud_kitchen_demo_orders_initialized';

type DemoOrderTemplate = {
  orderNumber: string;
  brandName: string;
  customerName: string;
  phone: string;
  phoneSecondary?: string;
  orderMode: 'package' | 'meals';
  packageIndex?: number;
  mealIndexes?: number[];
  executionDate: string;
  status: OrderStatus;
  source: OrderSource;
  notes: string;
  mealType: Order['meal_type'];
  address: {
    address_house_number: string;
    address_street: string;
    address_area: string;
    address_floor: string;
    address_apartment: string;
  };
};

const DEMO_ORDER_TEMPLATES: DemoOrderTemplate[] = [
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2101`,
    brandName: 'Healthy Food',
    customerName: 'سارة محمود',
    phone: '01021000001',
    phoneSecondary: '01121000001',
    orderMode: 'package',
    packageIndex: 0,
    executionDate: '2026-03-21',
    status: 'new',
    source: 'instagram',
    notes: 'طلب تجريبي ليوم 21 مارس - باقة سريعة.',
    mealType: 'full_day',
    address: { address_house_number: '18', address_street: 'شارع النرجس', address_area: 'التجمع', address_floor: '2', address_apartment: '8' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2102`,
    brandName: 'Healthy Station',
    customerName: 'محمد إبراهيم',
    phone: '01022000002',
    orderMode: 'meals',
    mealIndexes: [0, 1],
    executionDate: '2026-03-21',
    status: 'confirmed',
    source: 'facebook',
    notes: 'طلب تجريبي ليوم 21 مارس - وجبتان متكررتان لاحقًا لعميل آخر.',
    mealType: 'lunch',
    address: { address_house_number: '42', address_street: 'شارع الجامعة', address_area: 'مدينة نصر', address_floor: '5', address_apartment: '12' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2103`,
    brandName: 'Protein Box',
    customerName: 'نورا علي',
    phone: '01023000003',
    orderMode: 'package',
    packageIndex: 1,
    executionDate: '2026-03-21',
    status: 'in_preparation',
    source: 'website',
    notes: 'طلب تجريبي من بروتين بوكس لعرض الباقات.',
    mealType: 'full_day',
    address: { address_house_number: '7', address_street: 'شارع مكة', address_area: 'المعادي', address_floor: '1', address_apartment: '3' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2201`,
    brandName: 'Healthy Food',
    customerName: 'أحمد سمير',
    phone: '01021000004',
    phoneSecondary: '01221000004',
    orderMode: 'meals',
    mealIndexes: [0, 1, 2],
    executionDate: '2026-03-22',
    status: 'new',
    source: 'referral',
    notes: 'طلب تجريبي 22 مارس - وجبات متنوعة من نفس البراند.',
    mealType: 'lunch',
    address: { address_house_number: '55', address_street: 'شارع الثورة', address_area: 'مصر الجديدة', address_floor: '4', address_apartment: '9' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2202`,
    brandName: 'Healthy Station',
    customerName: 'رانيا فتحي',
    phone: '01022000005',
    orderMode: 'package',
    packageIndex: 0,
    executionDate: '2026-03-22',
    status: 'out_for_delivery',
    source: 'instagram',
    notes: 'طلب تجريبي 22 مارس - نفس نوع الباقة قد يتكرر بين عملاء مختلفين.',
    mealType: 'full_day',
    address: { address_house_number: '11', address_street: 'شارع الخليفة', address_area: 'المقطم', address_floor: '3', address_apartment: '6' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2203`,
    brandName: 'Protein Box',
    customerName: 'كريم عادل',
    phone: '01023000006',
    orderMode: 'meals',
    mealIndexes: [0, 3],
    executionDate: '2026-03-22',
    status: 'confirmed',
    source: 'facebook',
    notes: 'طلب تجريبي 22 مارس - وجبات متكررة جزئيًا مع عميل آخر.',
    mealType: 'lunch',
    address: { address_house_number: '29', address_street: 'شارع الحجاز', address_area: 'النزهة', address_floor: '6', address_apartment: '14' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2204`,
    brandName: 'Healthy Food',
    customerName: 'دينا هشام',
    phone: '01021000007',
    orderMode: 'package',
    packageIndex: 2,
    executionDate: '2026-03-22',
    status: 'delivered',
    source: 'website',
    notes: 'طلب تجريبي مسلم لإظهار التنوع في الحالات.',
    mealType: 'full_day',
    address: { address_house_number: '9', address_street: 'شارع عباس', address_area: 'الزيتون', address_floor: '2', address_apartment: '5' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2301`,
    brandName: 'Healthy Station',
    customerName: 'شريف طارق',
    phone: '01022000008',
    orderMode: 'meals',
    mealIndexes: [0, 1],
    executionDate: '2026-03-23',
    status: 'new',
    source: 'referral',
    notes: 'نفس وجبات Order 2102 لكن لعميل مختلف لتجربة التكرار.',
    mealType: 'lunch',
    address: { address_house_number: '63', address_street: 'شارع الترعة', address_area: 'شبرا', address_floor: '7', address_apartment: '15' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2302`,
    brandName: 'Protein Box',
    customerName: 'هاجر سعيد',
    phone: '01023000009',
    phoneSecondary: '01223000009',
    orderMode: 'package',
    packageIndex: 4,
    executionDate: '2026-03-23',
    status: 'in_preparation',
    source: 'instagram',
    notes: 'طلب تجريبي 23 مارس - باقة طويلة المدة.',
    mealType: 'full_day',
    address: { address_house_number: '14', address_street: 'شارع عمر', address_area: 'الشيخ زايد', address_floor: '1', address_apartment: '2' },
  },
  {
    orderNumber: `${DEMO_ORDER_NUMBER_PREFIX}-2303`,
    brandName: 'Healthy Food',
    customerName: 'ياسمين فؤاد',
    phone: '01021000010',
    orderMode: 'meals',
    mealIndexes: [0, 1, 2],
    executionDate: '2026-03-23',
    status: 'cancelled',
    source: 'other',
    notes: 'نفس الوجبات تقريبًا لعميل آخر مع حالة ملغي للتجربة.',
    mealType: 'lunch',
    address: { address_house_number: '88', address_street: 'شارع التسعين', address_area: 'التجمع', address_floor: '8', address_apartment: '21' },
  },
];

export function buildDemoOrders(brands: Brand[]): Array<Omit<Order, 'id' | 'created_at'>> {
  const brandMap = new Map(brands.map((brand) => [compactWhitespace(brand.name).toLowerCase(), brand]));

  return DEMO_ORDER_TEMPLATES.flatMap((template) => {
    const brand = brandMap.get(compactWhitespace(template.brandName).toLowerCase());
    if (!brand) {
      return [];
    }

    const meals = buildDemoMealsForBrand(brand.name);
    const packages = buildDemoPackagesForBrand(brand.name);
    const selectedMeals = (template.mealIndexes ?? []).map((index) => meals[index]).filter(Boolean);
    const selectedPackage = template.packageIndex === undefined ? null : packages[template.packageIndex] ?? null;

    const packageLabel = template.orderMode === 'package'
      ? selectedPackage?.name ?? `باقة ${brand.name}`
      : selectedMeals.map((meal) => meal.name).join(' + ');

    const price = template.orderMode === 'package'
      ? selectedPackage?.price ?? 0
      : selectedMeals.reduce((sum, meal) => sum + meal.price, 0);

    const address = formatDetailedAddress(template.address);

    return [{
      order_number: template.orderNumber,
      customer_name: template.customerName,
      phone: template.phone,
      phone_secondary: template.phoneSecondary ?? '',
      address,
      ...template.address,
      execution_date: template.executionDate,
      order_mode: template.orderMode,
      package: packageLabel,
      package_plan_id: null,
      meal_type: template.mealType,
      notes: `[demo-orders-march-2026] ${template.notes}`,
      package_meal_snapshot: template.orderMode === 'package'
        ? ((selectedPackage?.mealNames ?? []).map((mealName, index) => {
            const meal = meals.find(item => item.name === mealName);
            return {
              key: `demo-package-item-${index + 1}`,
              label: mealName,
              category: meal?.category ?? null,
            };
          }))
        : [],
      status: template.status,
      price,
      selected_meal_ids: [],
      source: template.source,
      brand_id: brand.id,
      created_by: null,
    } satisfies Omit<Order, 'id' | 'created_at'>];
  });
}

export function materializeDemoOrders(brands: Brand[]): Order[] {
  const baseTimestamp = '2026-03-20T09:00:00.000Z';

  return buildDemoOrders(brands).map((order, index) => ({
    id: `demo-order-${index + 1}`,
    created_at: baseTimestamp,
    ...order,
  }));
}

export function getLocalDemoOrders(): Order[] {
  const rawValue = localStorage.getItem(DEMO_ORDERS_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as Order[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalDemoOrders(orders: Order[]) {
  localStorage.setItem(DEMO_ORDERS_STORAGE_KEY, JSON.stringify(orders));
}

export function clearLocalDemoOrders() {
  localStorage.removeItem(DEMO_ORDERS_STORAGE_KEY);
}

export function markDemoOrdersInitialized() {
  localStorage.setItem(DEMO_ORDERS_INITIALIZED_KEY, 'true');
}

export function isDemoOrdersInitialized() {
  return localStorage.getItem(DEMO_ORDERS_INITIALIZED_KEY) === 'true';
}

export function hasCompleteDemoOrders(orders: Array<Pick<Order, 'order_number'>>) {
  return orders.filter((order) => order.order_number.startsWith(DEMO_ORDER_NUMBER_PREFIX)).length >= 10;
}