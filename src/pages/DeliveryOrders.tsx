import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrders } from '@/hooks/useOrders';
import { useBrands } from '@/hooks/useBrands';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import OrderCard from '@/components/OrderCard';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function DeliveryOrders() {
  const { user } = useAuth();
  const { orders, loading, updateStatus, updateOrder, refresh } = useOrders();
  const { brands } = useBrands();
  const { meals, packages } = useMenuCatalog();
  const myOrders = useMemo(() => orders.filter((order) => order.assigned_to === user?.id), [orders, user?.id]);

  const handleRecordLocation = async (orderId: string, locationLink: string) => {
    const target = orders.find((order) => order.id === orderId);
    if (!target) return false;
    const { id: _id, created_at: _createdAt, ...payload } = target;
    const ok = await updateOrder(orderId, { ...payload, location_link: locationLink });
    if (ok) {
      toast.success('تم تسجيل موقع العميل بنجاح');
      void refresh();
    }
    return ok;
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AppLayoutHeaderPortal>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 tabular-nums tracking-tight">
          {myOrders.length.toLocaleString('en-US')} طلب مسند
        </span>
      </AppLayoutHeaderPortal>

      <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-500">
        الطلبات المسندة إليك فقط. اضغط على <strong className="text-slate-800">تسجيل الموقع</strong> عند الوصول للعميل لحفظ إحداثيات التوصيل الدقيقة.
      </div>

      {myOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          لا توجد طلبات مسندة إليك حاليًا.
        </div>
      ) : (
        <div className="space-y-3">
          {myOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdate={() => void refresh()}
              updateStatus={updateStatus}
              onRecordLocation={handleRecordLocation}
              brands={brands}
              meals={meals}
              packages={packages}
            />
          ))}
        </div>
      )}
    </div>
  );
}