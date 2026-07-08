import { MenuCategory } from '@/types/menu';

export type OrderStatus = 'new' | 'confirmed' | 'in_preparation' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type MealType = 'lunch' | 'full_day';
export type OrderSource = 'facebook' | 'instagram' | 'website' | 'referral' | 'other';
export type OrderMode = 'package' | 'meals';

export interface OrderMealCustomization {
  key: string;
  label: string;
  notes: string;
}

export interface OrderMealSnapshotItem {
  key: string;
  label: string;
  category?: MenuCategory | null;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  phone: string;
  phone_secondary: string;
  location_link?: string;
  address: string;
  address_house_number: string;
  address_street: string;
  address_area: string;
  address_floor: string;
  address_apartment: string;
  execution_date: string;
  order_mode: OrderMode;
  package: string;
  package_plan_id: string | null;
  meal_type: MealType;
  notes: string;
  meal_customizations?: OrderMealCustomization[];
  package_meal_snapshot?: OrderMealSnapshotItem[];
  status: OrderStatus;
  created_at: string;
  price: number;
  selected_meal_ids: string[];
  source: OrderSource;
  brand_id: string | null;
  created_by: string | null;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'جديد',
  confirmed: 'تم التأكيد',
  in_preparation: 'قيد التحضير',
  out_for_delivery: 'خرج للتوصيل',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-info text-info-foreground',
  confirmed: 'bg-primary text-primary-foreground',
  in_preparation: 'bg-warning text-warning-foreground',
  out_for_delivery: 'bg-secondary text-secondary-foreground',
  delivered: 'bg-success text-success-foreground',
  cancelled: 'bg-destructive text-destructive-foreground',
};

export const SOURCE_LABELS: Record<OrderSource, string> = {
  facebook: 'فيسبوك',
  instagram: 'إنستجرام',
  website: 'الموقع',
  referral: 'إحالة',
  other: 'أخرى',
};

export const SOURCE_ICONS: Record<OrderSource, string> = {
  facebook: '📘',
  instagram: '📸',
  website: '🌐',
  referral: '🤝',
  other: '📋',
};

export const ORDER_MODE_LABELS: Record<OrderMode, string> = {
  package: 'باقة',
  meals: 'وجبات من المنيو',
};

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  new: 'confirmed',
  confirmed: 'in_preparation',
  in_preparation: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

export const ACHIEVEMENT_TIERS = [
  { badge: 'bronze', label: 'برونزي', threshold: 10, color: '#CD7F32', emoji: '🥉' },
  { badge: 'silver', label: 'فضي', threshold: 30, color: '#C0C0C0', emoji: '🥈' },
  { badge: 'gold', label: 'ذهبي', threshold: 50, color: '#FFD700', emoji: '🥇' },
];
