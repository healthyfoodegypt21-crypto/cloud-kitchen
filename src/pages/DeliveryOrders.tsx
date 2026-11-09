import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrders } from '@/hooks/useOrders';
import { useBrands } from '@/hooks/useBrands';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import OrderCard from '@/components/OrderCard';
import { Loader2 } from 'lucide-react';

export default function DeliveryOrders() {
  const { user } = useAuth();
  const { orders, loading, updateStatus } = useOrders();
  const { brands } = useBrands();
  const { meals, packages } = useMenuCatalog();
  const myOrders = useMemo(() => orders.filter(order => order.assigned_to === user?.id), [orders, user?.id]);

  if (loading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return <div className="space-y-4">
    <div><h1 className="text-2xl font-bold">أوردراتي</h1><p className="text-sm text-muted-foreground">الطلبات المسندة إليك فقط. سجّل موقع العميل عند الوصول.</p></div>
    {myOrders.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد طلبات مسندة إليك حاليًا.</div> : <div className="space-y-3">{myOrders.map(order => <OrderCard key={order.id} order={order} onUpdate={() => undefined} updateStatus={updateStatus} brands={brands} meals={meals} packages={packages} />)}</div>}
  </div>;
}