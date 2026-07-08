import { useOrders } from '@/hooks/useOrders';
import { useBrands } from '@/hooks/useBrands';
import { useTargets } from '@/hooks/useTargets';
import Dashboard from '@/pages/Dashboard';
import NewOrderDialog from '@/components/NewOrderDialog';

export default function Index() {
  const { orders, addOrder, refresh } = useOrders();
  const { brands } = useBrands();
  const { getTarget } = useTargets();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <NewOrderDialog onCreated={refresh} addOrder={addOrder} />
      </div>
      <Dashboard orders={orders} brands={brands} getTarget={getTarget} />
    </div>
  );
}
