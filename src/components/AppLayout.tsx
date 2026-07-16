import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, Users, LogOut, Settings, Trophy, Menu, X, UtensilsCrossed, ChefHat, Boxes, ShoppingCart, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { hasPageAccess, type AppPageId } from '@/lib/permissions';

type NavItem = { to: string; label: string; icon: React.ElementType; pageId: AppPageId; allowInDemo?: boolean; ownerOnly?: boolean };

const navItems: NavItem[] = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, pageId: 'dashboard', allowInDemo: true },
  { to: '/orders', label: 'الطلبات', icon: ClipboardList, pageId: 'orders', allowInDemo: true },
  { to: '/kitchen', label: 'المطبخ', icon: ChefHat, pageId: 'kitchen', allowInDemo: true },
  { to: '/inventory', label: 'المخزون', icon: Boxes, pageId: 'inventory', allowInDemo: true },
  { to: '/purchases', label: 'المشتريات', icon: ShoppingCart, pageId: 'purchases', allowInDemo: true },
  { to: '/cleaning', label: 'التنظيفات', icon: Sparkles, pageId: 'cleaning' },
  { to: '/menu-packages', label: 'المنيو والباقات', icon: UtensilsCrossed, pageId: 'menu-packages' },
  { to: '/customers', label: 'العملاء', icon: Users, pageId: 'customers', allowInDemo: true },
  { to: '/leaderboard', label: 'لوحة الصدارة', icon: Trophy, pageId: 'leaderboard', allowInDemo: true },
  { to: '/users', label: 'المستخدمون', icon: Users, pageId: 'users', ownerOnly: true },
  { to: '/settings', label: 'الإعدادات', icon: Settings, pageId: 'settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { role, displayName, signOut, isDemoMode, pagePermissions } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleItems = navItems.filter((item) => role
    && (!item.ownerOnly || role === 'owner')
    && (!isDemoMode || item.allowInDemo)
    && (isDemoMode || hasPageAccess(role, pagePermissions, item.pageId)));

  return (
    <div className="min-h-screen bg-background flex">
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Right sidebar - desktop always visible, mobile toggle */}
      <aside className={`
        fixed lg:sticky top-0 right-0 z-50 h-screen w-64
        bg-card border-l flex flex-col
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Brand */}
        <div className="p-4 border-b">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-primary">
            <BrandLogo />
          </Link>
          <p className="text-xs text-muted-foreground mt-1 truncate">👋 {displayName}</p>
          {isDemoMode ? <p className="mt-2 text-xs font-medium text-amber-600">وضع تجريبي محلي بصلاحيات غير تشغيلية</p> : null}
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleItems.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-50 border-b bg-card/90 backdrop-blur-sm">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg text-primary">
              <BrandLogo />
            </Link>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-6xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
