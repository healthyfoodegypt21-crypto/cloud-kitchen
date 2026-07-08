import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Index from "./pages/Index";
import KitchenRoute from "./pages/KitchenRoute";
import OrdersRoute from "./pages/OrdersRoute";
import CustomersRoute from "./pages/CustomersRoute";
import LeaderboardRoute from "./pages/LeaderboardRoute";
import MenuPackagesRoute from "./pages/MenuPackagesRoute";
import InventoryRoute from "./pages/InventoryRoute";
import PurchasesRoute from "./pages/PurchasesRoute";
import UsersManagement from "./pages/UsersManagement";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import type { AppPageId } from "@/lib/permissions";
import { hasPageAccess } from "@/lib/permissions";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles, allowDemo = false, requiredPage }: { children: React.ReactNode; allowedRoles?: string[]; allowDemo?: boolean; requiredPage?: AppPageId }) {
  const { user, role, loading, isDemoMode, pagePermissions } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isDemoMode && !allowDemo) return <Navigate to="/" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/" replace />;
  if (requiredPage && !isDemoMode && !hasPageAccess(role, pagePermissions, requiredPage)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={
        <ProtectedRoute allowedRoles={['owner', 'call_center']} allowDemo requiredPage="dashboard">
          <AppLayout><Index /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders" element={
        <ProtectedRoute allowedRoles={['owner', 'call_center', 'kitchen', 'delivery']} allowDemo requiredPage="orders">
          <AppLayout><OrdersRoute /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/kitchen" element={
        <ProtectedRoute allowedRoles={['owner', 'kitchen']} allowDemo requiredPage="kitchen">
          <AppLayout><KitchenRoute /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers" element={
        <ProtectedRoute allowedRoles={['owner', 'call_center']} allowDemo requiredPage="customers">
          <AppLayout><CustomersRoute /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/leaderboard" element={
        <ProtectedRoute allowedRoles={['owner', 'call_center']} allowDemo requiredPage="leaderboard">
          <AppLayout><LeaderboardRoute /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/menu-packages" element={
        <ProtectedRoute allowedRoles={['owner', 'call_center']} requiredPage="menu-packages">
          <AppLayout><MenuPackagesRoute /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/inventory" element={
        <ProtectedRoute allowedRoles={['owner', 'kitchen']} allowDemo requiredPage="inventory">
          <AppLayout><InventoryRoute /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/purchases" element={
        <ProtectedRoute allowedRoles={['owner', 'call_center', 'kitchen']} allowDemo requiredPage="purchases">
          <AppLayout><PurchasesRoute /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute allowedRoles={['owner']} requiredPage="users">
          <AppLayout><UsersManagement /></AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute requiredPage="settings">
          <AppLayout><Settings /></AppLayout>
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
