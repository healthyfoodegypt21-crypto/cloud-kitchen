import type { Database } from '@/integrations/supabase/types';

type KnownAppRole = Database['public']['Enums']['app_role'];

export type AppPageId =
  | 'dashboard'
  | 'orders'
  | 'kitchen'
  | 'customers'
  | 'leaderboard'
  | 'menu-packages'
  | 'inventory'
  | 'purchases'
  | 'users'
  | 'settings';

export const ALL_PAGES: { id: AppPageId; label: string }[] = [
  { id: 'dashboard', label: 'لوحة التحكم' },
  { id: 'orders', label: 'الطلبات' },
  { id: 'kitchen', label: 'المطبخ' },
  { id: 'customers', label: 'العملاء' },
  { id: 'leaderboard', label: 'لوحة الصدارة' },
  { id: 'menu-packages', label: 'المنيو والباقات' },
  { id: 'inventory', label: 'المخزون' },
  { id: 'purchases', label: 'المشتريات' },
  { id: 'users', label: 'إدارة المستخدمين' },
  { id: 'settings', label: 'الإعدادات' },
];

export const DEFAULT_PAGES: Record<KnownAppRole, AppPageId[]> = {
  owner: ALL_PAGES.map((page) => page.id),
  call_center: ['dashboard', 'orders', 'customers', 'leaderboard', 'menu-packages', 'purchases', 'settings'],
  kitchen: ['orders', 'kitchen', 'inventory', 'purchases', 'settings'],
  delivery: ['orders', 'settings'],
};

export function hasPageAccess(role: string | null, pagePermissions: string[], pageId: AppPageId) {
  return role === 'owner' || pagePermissions.includes(pageId);
}