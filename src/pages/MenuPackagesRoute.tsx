import { useBrands } from '@/hooks/useBrands';
import { useOrders } from '@/hooks/useOrders';
import MenuPackagesPage from '@/pages/MenuPackages';

export default function MenuPackagesRoute() {
  const { brands, loading, refresh: refreshBrands } = useBrands();
  const { orders } = useOrders();

  return <MenuPackagesPage brands={brands} brandsLoading={loading} orders={orders} onRefreshBrands={refreshBrands} />;
}