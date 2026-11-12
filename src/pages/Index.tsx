import { useOrders } from '@/hooks/useOrders';
import { useBrands } from '@/hooks/useBrands';
import { useTargets } from '@/hooks/useTargets';
import Dashboard from '@/pages/Dashboard';
import NewOrderDialog from '@/components/NewOrderDialog';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';

export default function Index() {
  const { orders, addOrder, refresh } = useOrders();
  const { brands } = useBrands();
  const { getTarget } = useTargets();

  return (
    <>
      <AppLayoutHeaderPortal>
        <NewOrderDialog onCreated={refresh} addOrder={addOrder} />
      </AppLayoutHeaderPortal>
      <Dashboard orders={orders} brands={brands} getTarget={getTarget} />
    </>
  );
}
