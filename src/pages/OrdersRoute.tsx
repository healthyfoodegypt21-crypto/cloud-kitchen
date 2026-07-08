import { useOrders } from '@/hooks/useOrders';
import { useBrands } from '@/hooks/useBrands';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import OrdersPage from '@/pages/Orders';

export default function OrdersRoute() {
  const { orders, loading, addOrder, updateStatus, refresh, seedDemoOrders } = useOrders();
  const { brands } = useBrands();
  const { meals, packages } = useMenuCatalog();

  return <OrdersPage orders={orders} loading={loading} onRefresh={refresh} addOrder={addOrder} updateStatus={updateStatus} seedDemoOrders={seedDemoOrders} brands={brands} meals={meals} packages={packages} />;
}
