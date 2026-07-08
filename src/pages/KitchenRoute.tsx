import { useBrands } from '@/hooks/useBrands';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import { useOrders } from '@/hooks/useOrders';
import KitchenPage from '@/pages/Kitchen';

export default function KitchenRoute() {
  const { brands, loading: brandsLoading } = useBrands();
  const { orders, loading: ordersLoading, seedDemoOrders } = useOrders();
  const { meals, packages, loading: catalogLoading } = useMenuCatalog();

  return (
    <KitchenPage
      brands={brands}
      brandsLoading={brandsLoading}
      orders={orders}
      ordersLoading={ordersLoading}
      meals={meals}
      packages={packages}
      catalogLoading={catalogLoading}
      seedDemoOrders={seedDemoOrders}
    />
  );
}