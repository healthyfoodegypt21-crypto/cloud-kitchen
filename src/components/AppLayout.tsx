import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  LogOut,
  Settings,
  Trophy,
  Menu,
  X,
  UtensilsCrossed,
  ChefHat,
  Boxes,
  ShoppingCart,
  UserCog,
  Shield,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import BrandLogo from '@/components/BrandLogo';
import GlobalCommandPalette from '@/components/GlobalCommandPalette';
import { useOrdersSummaryState } from '@/lib/ordersSummaryStore';
import { hasPageAccess, type AppPageId } from '@/lib/permissions';
import { ACHIEVEMENT_TIERS } from '@/types/order';
import { cn } from '@/lib/utils';

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  pageId: AppPageId;
  allowInDemo?: boolean;
  ownerOnly?: boolean;
};

type NavGroup = {
  category: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    category: 'نظرة عامة',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, pageId: 'dashboard', allowInDemo: true },
    ],
  },
  {
    category: 'التشغيل والمطبخ',
    items: [
      { to: '/orders', label: 'الطلبات', icon: ClipboardList, pageId: 'orders', allowInDemo: true },
      { to: '/kitchen', label: 'المطبخ', icon: ChefHat, pageId: 'kitchen', allowInDemo: true },
      { to: '/inventory', label: 'المخزون', icon: Boxes, pageId: 'inventory', allowInDemo: true },
      { to: '/purchases', label: 'المشتريات', icon: ShoppingCart, pageId: 'purchases', allowInDemo: true },
    ],
  },
  {
    category: 'المنيو والعملاء',
    items: [
      { to: '/menu-packages', label: 'الشركات والمنيو والباقات', icon: UtensilsCrossed, pageId: 'menu-packages' },
      { to: '/customers', label: 'العملاء', icon: Users, pageId: 'customers', allowInDemo: true },
    ],
  },
  {
    category: 'الأداء والإدارة',
    items: [
      { to: '/leaderboard', label: 'لوحة الصدارة', icon: Trophy, pageId: 'leaderboard', allowInDemo: true },
      { to: '/hr', label: 'الموارد البشرية', icon: UserCog, pageId: 'hr' },
      { to: '/users', label: 'المستخدمون', icon: Shield, pageId: 'users', ownerOnly: true },
      { to: '/settings', label: 'الإعدادات', icon: Settings, pageId: 'settings' },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  '/': 'لوحة التحكم',
  '/orders': 'الطلبات',
  '/my-orders': 'أوردراتي',
  '/kitchen': 'المطبخ',
  '/inventory': 'المخزون',
  '/purchases': 'المشتريات',
  '/menu-packages': 'الشركات والمنيو والباقات',
  '/companies-menus': 'الشركات والمنيو والباقات',
  '/customers': 'العملاء',
  '/leaderboard': 'لوحة الصدارة',
  '/hr': 'الموارد البشرية',
  '/users': 'المستخدمون',
  '/settings': 'الإعدادات',
};

const AppLayoutHeaderActionsContext = createContext<HTMLDivElement | null>(null);

export function AppLayoutHeaderPortal({ children }: { children: React.ReactNode }) {
  const slot = useContext(AppLayoutHeaderActionsContext);
  if (slot) {
    return createPortal(children, slot);
  }
  return <div className="mb-4 flex items-center justify-end">{children}</div>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user, role, displayName, signOut, isDemoMode, pagePermissions } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerActionsSlot, setHeaderActionsSlot] = useState<HTMLDivElement | null>(null);

  const { activeOrdersCount, monthOrderCount, hydrated } = useOrdersSummaryState();

  useEffect(() => {
    if (!user || hydrated) {
      return;
    }
    void import('@/hooks/useOrders').then((mod) => mod.hydrateOrdersSummaryMetrics());
  }, [user, hydrated]);

  const currentTier = useMemo(
    () => [...ACHIEVEMENT_TIERS].reverse().find((tier) => monthOrderCount >= tier.threshold),
    [monthOrderCount],
  );

  const visibleGroups = useMemo(() => {
    if (role === 'delivery') {
      return [
        {
          category: 'التشغيل والمطبخ',
          items: [{ to: '/my-orders', label: 'أوردراتي', icon: ClipboardList, pageId: 'orders' as AppPageId }],
        },
      ];
    }

    return navGroups
      .map((group) => ({
        category: group.category,
        items: group.items.filter(
          (item) =>
            role &&
            (!item.ownerOnly || role === 'owner') &&
            (!isDemoMode || item.allowInDemo) &&
            (isDemoMode || hasPageAccess(role, pagePermissions, item.pageId)),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [role, isDemoMode, pagePermissions]);

  const currentPageTitle = ROUTE_TITLES[pathname] ?? 'لوحة التحكم';

  return (
    <AppLayoutHeaderActionsContext.Provider value={headerActionsSlot}>
      <div dir="rtl" className="min-h-screen bg-slate-50/80 text-slate-900 antialiased flex">
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Right-Docked Categorized Sidebar */}
        <aside
          className={cn(
            'fixed lg:sticky top-0 right-0 z-50 w-64 shrink-0 bg-white border-l border-slate-200/80 flex flex-col justify-between h-screen select-none transition-transform duration-200',
            sidebarOpen ? 'translate-x-0' : 'translate-x-full',
            'lg:translate-x-0',
          )}
        >
          {/* 1. Brand & User Header */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <BrandLogo compact iconClassName="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-bold tracking-wider text-slate-900">CLOUD KITCHENS</span>
              </Link>
              <button
                type="button"
                aria-label="إغلاق القائمة"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 p-2 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 truncate">
                {displayName || 'Maikel'}
              </span>
              {currentTier && (
                <span
                  className={cn(
                    'px-2 py-0.5 text-[11px] font-medium rounded-full shrink-0',
                    currentTier.badge === 'gold' && 'bg-amber-50 text-amber-700 border border-amber-200/80',
                    currentTier.badge === 'silver' && 'bg-slate-100 text-slate-700 border border-slate-200/80',
                    currentTier.badge === 'bronze' && 'bg-orange-50 text-orange-700 border border-orange-200/80',
                  )}
                >
                  {currentTier.label} {currentTier.badge === 'gold' ? '🏅' : currentTier.emoji}
                </span>
              )}
            </div>

            {isDemoMode ? (
              <p className="mt-2 text-[11px] font-medium text-amber-700">وضع تجريبي محلي بصلاحيات غير تشغيلية</p>
            ) : null}
          </div>

          {/* 2. Grouped Navigation List */}
          <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
            {visibleGroups.map((group) => (
              <div key={group.category}>
                <div className="px-2.5 mb-1.5 text-[11px] font-semibold text-slate-400 tracking-wide">
                  {group.category}
                </div>
                <div className="space-y-0.5">
                  {group.items.map(({ to, label, icon: Icon }) => {
                    const active = pathname === to;
                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setSidebarOpen(false)}
                        className={
                          active
                            ? 'flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-semibold bg-emerald-50/80 text-emerald-700 border-r-[3px] border-emerald-600'
                            : 'flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors'
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{label}</span>
                        {to === '/orders' && activeOrdersCount > 0 && (
                          <span className="mr-auto bg-amber-100 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums tracking-tight">
                            {activeOrdersCount.toLocaleString('en-US')}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* 3. Sticky Sidebar Footer */}
          <div className="p-3 border-t border-slate-100">
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Unified Sticky Top Header Bar */}
          <header className="sticky top-0 z-20 h-16 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                aria-label="فتح القائمة"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="lg:hidden p-2 -mr-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-bold text-slate-900 truncate">{currentPageTitle}</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/60 text-[11px] font-medium text-emerald-700 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>متصل الآن</span>
              </span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <GlobalCommandPalette
                sections={visibleGroups}
                canAccessOrders={visibleGroups.some((g) => g.items.some((i) => i.to === '/orders'))}
                canAccessCustomers={visibleGroups.some((g) => g.items.some((i) => i.to === '/customers'))}
                canAccessKitchen={visibleGroups.some((g) => g.items.some((i) => i.to === '/kitchen'))}
              />
              <div ref={setHeaderActionsSlot} className="flex items-center gap-2.5 shrink-0" />
            </div>
          </header>

          <main className="flex-1 w-full max-w-[1440px] mx-auto p-6">{children}</main>
        </div>
      </div>
    </AppLayoutHeaderActionsContext.Provider>
  );
}
