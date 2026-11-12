import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import type { AppPageId } from "@/lib/permissions";
import { hasPageAccess } from "@/lib/permissions";

const KitchenRoute = lazy(() => import("./pages/KitchenRoute"));
const OrdersRoute = lazy(() => import("./pages/OrdersRoute"));
const CustomersRoute = lazy(() => import("./pages/CustomersRoute"));
const LeaderboardRoute = lazy(() => import("./pages/LeaderboardRoute"));
const MenuPackagesRoute = lazy(() => import("./pages/MenuPackagesRoute"));
const InventoryRoute = lazy(() => import("./pages/InventoryRoute"));
const PurchasesRoute = lazy(() => import("./pages/PurchasesRoute"));
const HR = lazy(() => import("./pages/HR"));
const UsersManagement = lazy(() => import("./pages/UsersManagement"));
const Settings = lazy(() => import("./pages/Settings"));
const DeliveryOrders = lazy(() => import("./pages/DeliveryOrders"));

function RouteFallback() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

const queryClient = new QueryClient();

const pageRoutes: Record<AppPageId, string> = {
  dashboard: '/',
  orders: '/orders',
  kitchen: '/kitchen',
  customers: '/customers',
  leaderboard: '/leaderboard',
  'menu-packages': '/menu-packages',
  'companies-menus': '/menu-packages',
  inventory: '/inventory',
  purchases: '/purchases',
  hr: '/hr',
  users: '/users',
  settings: '/settings',
};

const pagePriority: AppPageId[] = ['dashboard', 'orders', 'kitchen', 'inventory', 'purchases', 'hr', 'customers', 'leaderboard', 'menu-packages', 'companies-menus', 'settings', 'users'];

function permittedHome(role: string | null, pagePermissions: string[], isDemoMode: boolean) {
  if (isDemoMode || role === 'owner') return '/';
  if (role === 'delivery') return '/my-orders';
  const permittedPage = pagePriority.find((page) => hasPageAccess(role, pagePermissions, page));
  return permittedPage ? pageRoutes[permittedPage] : '/login';
}

function ProtectedRoute({ children, allowDemo = false, requiredPage, ownerOnly = false }: { children: React.ReactNode; allowDemo?: boolean; requiredPage?: AppPageId; ownerOnly?: boolean }) {
  const { user, role, loading, isDemoMode, pagePermissions } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isDemoMode && !allowDemo) return <Navigate to="/" replace />;
  if (ownerOnly && role !== 'owner') return <Navigate to={permittedHome(role, pagePermissions, isDemoMode)} replace />;
  if (requiredPage && !isDemoMode && !hasPageAccess(role, pagePermissions, requiredPage)) return <Navigate to={permittedHome(role, pagePermissions, isDemoMode)} replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, role, pagePermissions, isDemoMode, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/login" element={user ? <Navigate to={permittedHome(role, pagePermissions, isDemoMode)} replace /> : <Login />} />
      <Route path="/" element={
        <ProtectedRoute allowDemo requiredPage="dashboard">
          <AppLayout><Index /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders" element={
        <ProtectedRoute allowDemo requiredPage="orders">
          <AppLayout><Suspense fallback={<RouteFallback />}><OrdersRoute /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/my-orders" element={
        <ProtectedRoute requiredPage="orders">
          <AppLayout><Suspense fallback={<RouteFallback />}><DeliveryOrders /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/kitchen" element={
        <ProtectedRoute allowDemo requiredPage="kitchen">
          <AppLayout><Suspense fallback={<RouteFallback />}><KitchenRoute /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers" element={
        <ProtectedRoute allowDemo requiredPage="customers">
          <AppLayout><Suspense fallback={<RouteFallback />}><CustomersRoute /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/leaderboard" element={
        <ProtectedRoute allowDemo requiredPage="leaderboard">
          <AppLayout><Suspense fallback={<RouteFallback />}><LeaderboardRoute /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/menu-packages" element={
        <ProtectedRoute requiredPage="menu-packages">
          <AppLayout><Suspense fallback={<RouteFallback />}><MenuPackagesRoute /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/companies-menus" element={<Navigate to="/menu-packages" replace />} />
      <Route path="/inventory" element={
        <ProtectedRoute allowDemo requiredPage="inventory">
          <AppLayout><Suspense fallback={<RouteFallback />}><InventoryRoute /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/purchases" element={
        <ProtectedRoute allowDemo requiredPage="purchases">
          <AppLayout><Suspense fallback={<RouteFallback />}><PurchasesRoute /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/hr" element={
        <ProtectedRoute requiredPage="hr">
          <AppLayout><Suspense fallback={<RouteFallback />}><HR /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute ownerOnly requiredPage="users">
          <AppLayout><Suspense fallback={<RouteFallback />}><UsersManagement /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute requiredPage="settings">
          <AppLayout><Suspense fallback={<RouteFallback />}><Settings /></Suspense></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
