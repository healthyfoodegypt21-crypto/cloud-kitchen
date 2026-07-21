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
  | 'cleaning'
  | 'hr'
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
  { id: 'cleaning', label: 'التنظيفات' },
  { id: 'hr', label: 'الموارد البشرية' },
  { id: 'users', label: 'إدارة المستخدمين' },
  { id: 'settings', label: 'الإعدادات' },
];

export const DEFAULT_PAGES: Record<KnownAppRole, AppPageId[]> = {
  owner: ALL_PAGES.map((page) => page.id),
  call_center: ['dashboard', 'orders', 'customers', 'leaderboard', 'menu-packages', 'purchases', 'settings'],
  kitchen: ['orders', 'kitchen', 'inventory', 'purchases', 'cleaning', 'settings'],
  delivery: ['orders', 'settings'],
};

export function hasPageAccess(role: string | null, pagePermissions: string[], pageId: AppPageId) {
  return role === 'owner' || pagePermissions.includes(pageId);
}

// Granular Human Resources actions. Sensitive actions (delete, approvals and
// closing a payroll month) are reserved for the owner, while any user granted
// the `hr` page can view and record day-to-day entries.
export type HrAction =
  | 'view'
  | 'add'
  | 'edit'
  | 'delete'
  | 'approve_payroll'
  | 'approve_deductions'
  | 'approve_advances'
  | 'lock_month';

const HR_OWNER_ONLY_ACTIONS: HrAction[] = ['delete', 'approve_payroll', 'approve_deductions', 'approve_advances', 'lock_month'];

export function hasHrAction(role: string | null, pagePermissions: string[], action: HrAction) {
  if (role === 'owner') return true;
  if (!hasPageAccess(role, pagePermissions, 'hr')) return false;
  return !HR_OWNER_ONLY_ACTIONS.includes(action);
}