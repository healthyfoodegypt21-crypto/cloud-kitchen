import { resolveOrderMeals } from '@/lib/orderMeals';
import { compactWhitespace, formatEGPCurrency, normalizePhone } from '@/lib/utils';
import { Customer } from '@/types/customer';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

export type CustomerSegment = 'vip' | 'at_risk' | 'new' | 'repeat';

export type WhatsAppTemplateId =
  | 'winback'
  | 'renewal'
  | 'vip_care'
  | 'welcome_feedback'
  | 'custom';

export interface WhatsAppTemplateOption {
  id: WhatsAppTemplateId;
  label: string;
  shortLabel: string;
  description: string;
}

export const WHATSAPP_TEMPLATE_OPTIONS: WhatsAppTemplateOption[] = [
  {
    id: 'winback',
    label: 'عرض استرجاع العميل المنقطع',
    shortLabel: 'عرض استرجاع',
    description: 'رسالة دافئة مع أولوية حجز أو ميزة خاصة لإعادة تنشيط العميل.',
  },
  {
    id: 'renewal',
    label: 'تذكير تجديد الباقة الأسبوعية/الشهرية',
    shortLabel: 'تجديد الباقة',
    description: 'تذكير لطيف لتجديد الاشتراك واختيار وجبات الفترة القادمة بدون انقطاع.',
  },
  {
    id: 'vip_care',
    label: 'شكر وعناية خاصة لعملاء VIP',
    shortLabel: 'عناية VIP',
    description: 'تقدير شخصي لكبار العملاء مع أولوية التخصيص والمتابعة.',
  },
  {
    id: 'welcome_feedback',
    label: 'اطمئنان وتقييم أول تجربة',
    shortLabel: 'تقييم أول طلب',
    description: 'متابعة سريعة بعد أول أوردر للتأكد من جودة الوجبات وموعد التوصيل.',
  },
  {
    id: 'custom',
    label: 'رسالة تواصل مباشر',
    shortLabel: 'تواصل مباشر',
    description: 'تحية مهذبة جاهزة لكتابة أي تفاصيل مخصصة للعميل.',
  },
];

/**
 * Normalizes Egyptian & international phone numbers for WhatsApp wa.me links.
 * Examples:
 *  - "0100 123-4567" -> "201001234567"
 *  - "1001234567"    -> "201001234567"
 *  - "+201001234567" -> "201001234567"
 *  - "00201001234567"-> "201001234567"
 */
export function formatWhatsAppPhone(rawPhone: string): string {
  const digits = normalizePhone(rawPhone);
  if (!digits) {
    return '';
  }

  if (digits.startsWith('00')) {
    return digits.slice(2);
  }

  if (/^01[0125]\d{8}$/.test(digits)) {
    return `2${digits}`;
  }

  if (/^1[0125]\d{8}$/.test(digits)) {
    return `20${digits}`;
  }

  return digits;
}

export function buildWhatsAppUrl(rawPhone: string, message?: string): string {
  const intlPhone = formatWhatsAppPhone(rawPhone);
  if (!intlPhone) {
    return '';
  }

  const trimmedMessage = message?.trim() ?? '';
  if (!trimmedMessage) {
    return `https://wa.me/${intlPhone}`;
  }

  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(trimmedMessage)}`;
}

export function getRecommendedTemplateForSegment(segment: CustomerSegment): WhatsAppTemplateId {
  switch (segment) {
    case 'at_risk':
      return 'winback';
    case 'vip':
      return 'vip_care';
    case 'new':
      return 'welcome_feedback';
    case 'repeat':
    default:
      return 'renewal';
  }
}

export function buildSmartWhatsAppMessage(params: {
  templateId: WhatsAppTemplateId;
  customerName: string;
  brandName?: string;
  lastPackageName?: string;
  orderCount?: number;
}): string {
  const firstName = compactWhitespace(params.customerName).split(' ')[0] || 'عميلنا العزيز';
  const brandTitle = compactWhitespace(params.brandName ?? '') || 'مطبخنا الصحي';
  const packageHint = compactWhitespace(params.lastPackageName ?? '');
  const ordersCountText = (params.orderCount ?? 0).toLocaleString('en-US');

  switch (params.templateId) {
    case 'winback':
      return `أهلاً ${firstName} 🌿\nنفتقد تحضير وجباتك الصحية في ${brandTitle}! جهزنا لك منيو هذا الأسبوع بأصناف جديدة ومميزة، ولك أولوية حجز وميزة خاصة عند تجديد طلبك اليوم. تحب نرسل لك منيو الأسبوع؟`;

    case 'renewal':
      return `أهلاً ${firstName} 🙌\nنتمنى أن تكون وجبات ${brandTitle}${packageHint ? ` (${packageHint})` : ''} قد نالت إعجابك! نذكرك بتجديد باقتك واختيار وجبات الفترة القادمة حتى تستمر وجباتك يومياً بنفس الموعد بدون انقطاع.`;

    case 'vip_care':
      return `أهلاً ${firstName} ⭐\nشكراً لثقتك المستمرة في ${brandTitle}${params.orderCount && params.orderCount > 0 ? ` (${ordersCountText} طلبات معنا)` : ''}. كأحد عملائنا الـ VIP المميزين، يسعدنا دائماً تخصيص وجباتك القادمة كما تحب ومنحك أولوية التجهيز والتوصيل. هل تود تجهيز طلبك القادم؟`;

    case 'welcome_feedback':
      return `أهلاً ${firstName} 👋\nسعداء جداً بانضمامك لعملاء ${brandTitle}! حابين نطمئن على تجربتك الأولى معنا: هل طعم الوجبات والتغليف وموعد التوصيل كانوا على أفضل مستوى؟ رأيك يهمنا جداً.`;

    case 'custom':
    default:
      return `أهلاً ${firstName}، معك فريق خدمة العملاء من ${brandTitle}. كيف يمكننا مساعدتك اليوم؟`;
  }
}

export interface CustomerFavoriteItem {
  label: string;
  count: number;
}

export interface Customer360Insights {
  orders: Order[];
  validOrdersCount: number;
  deliveredOrdersCount: number;
  cancelledOrdersCount: number;
  cancellationRate: number;
  lifetimeValue: number;
  averageOrderValue: number;
  daysSinceLastOrder: number | null;
  averageCadenceDays: number | null;
  lastPackageName: string;
  lastLocationOrder: Order | null;
  favoriteMeals: CustomerFavoriteItem[];
  favoritePackages: CustomerFavoriteItem[];
  recurringNotes: string[];
}

export function buildCustomer360Insights(
  customer: Customer,
  allOrders: Order[],
  meals: Meal[] = [],
  packages: PackagePlan[] = [],
  nowTimestamp = Date.now(),
): Customer360Insights {
  const targetPhone = normalizePhone(customer.phone);

  const customerOrders = allOrders
    .filter((order) => {
      const samePhone =
        normalizePhone(order.phone) === targetPhone ||
        (Boolean(targetPhone) && normalizePhone(order.phone_secondary) === targetPhone);
      if (!samePhone) return false;
      if (customer.brand_id && order.brand_id) {
        return order.brand_id === customer.brand_id;
      }
      return true;
    })
    .sort((left, right) => {
      const leftDate = new Date(left.execution_date || left.created_at).getTime();
      const rightDate = new Date(right.execution_date || right.created_at).getTime();
      return rightDate - leftDate;
    });

  const validOrders = customerOrders.filter((order) => order.status !== 'cancelled');
  const deliveredOrders = customerOrders.filter((order) => order.status === 'delivered');
  const cancelledOrders = customerOrders.filter((order) => order.status === 'cancelled');

  const lifetimeValue = validOrders.reduce((sum, order) => sum + order.price, 0);
  const averageOrderValue = validOrders.length > 0 ? lifetimeValue / validOrders.length : 0;
  const cancellationRate =
    customerOrders.length > 0 ? (cancelledOrders.length / customerOrders.length) * 100 : 0;

  const latestTimestampStr =
    customerOrders[0]?.created_at ?? customer.last_order_at ?? null;
  const daysSinceLastOrder = latestTimestampStr
    ? Math.max(0, Math.floor((nowTimestamp - new Date(latestTimestampStr).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  let averageCadenceDays: number | null = null;
  if (validOrders.length >= 2) {
    const sortedTimestamps = validOrders
      .map((order) => new Date(order.execution_date || order.created_at).getTime())
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => a - b);

    if (sortedTimestamps.length >= 2) {
      const spanDays =
        (sortedTimestamps[sortedTimestamps.length - 1] - sortedTimestamps[0]) /
        (1000 * 60 * 60 * 24);
      const avg = spanDays / (sortedTimestamps.length - 1);
      averageCadenceDays = Math.max(1, Math.round(avg));
    }
  }

  const mealCounts = new Map<string, { label: string; count: number }>();
  const packageCounts = new Map<string, { label: string; count: number }>();
  const notesSet = new Set<string>();

  if (compactWhitespace(customer.notes)) {
    notesSet.add(compactWhitespace(customer.notes));
  }

  for (const order of validOrders) {
    const pkgLabel = compactWhitespace(order.package);
    if (pkgLabel && pkgLabel !== 'وجبات من المنيو') {
      const key = pkgLabel.toLocaleLowerCase('ar');
      const existing = packageCounts.get(key);
      packageCounts.set(key, {
        label: existing?.label ?? pkgLabel,
        count: (existing?.count ?? 0) + 1,
      });
    }

    const resolved = resolveOrderMeals(order, meals, packages);
    for (const item of resolved) {
      const cleanLabel = compactWhitespace(item.label);
      if (!cleanLabel) continue;
      const key = cleanLabel.toLocaleLowerCase('ar');
      const existing = mealCounts.get(key);
      mealCounts.set(key, {
        label: existing?.label ?? cleanLabel,
        count: (existing?.count ?? 0) + 1,
      });

      if (item.instruction && compactWhitespace(item.instruction)) {
        notesSet.add(`${cleanLabel}: ${compactWhitespace(item.instruction)}`);
      }
    }

    if (order.notes && compactWhitespace(order.notes)) {
      notesSet.add(compactWhitespace(order.notes));
    }

    if (order.meal_customizations) {
      for (const custom of order.meal_customizations) {
        if (compactWhitespace(custom.notes)) {
          notesSet.add(`${compactWhitespace(custom.label)}: ${compactWhitespace(custom.notes)}`);
        }
      }
    }
  }

  const favoriteMeals = Array.from(mealCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const favoritePackages = Array.from(packageCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const lastPackageName =
    validOrders.find((o) => compactWhitespace(o.package) && o.package !== 'وجبات من المنيو')?.package ?? '';

  const lastLocationOrder =
    customerOrders.find((o) => Boolean(o.location_link) || Boolean(o.address)) ?? null;

  return {
    orders: customerOrders,
    validOrdersCount: validOrders.length,
    deliveredOrdersCount: deliveredOrders.length,
    cancelledOrdersCount: cancelledOrders.length,
    cancellationRate,
    lifetimeValue,
    averageOrderValue,
    daysSinceLastOrder,
    averageCadenceDays,
    lastPackageName,
    lastLocationOrder,
    favoriteMeals,
    favoritePackages,
    recurringNotes: Array.from(notesSet).slice(0, 6),
  };
}

export function formatCustomerRevenueLabel(amount: number): string {
  return formatEGPCurrency(amount);
}
