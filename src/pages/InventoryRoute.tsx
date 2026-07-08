import { useBrands } from '@/hooks/useBrands';
import InventoryPage from '@/pages/Inventory';

export default function InventoryRoute() {
  const { brands, loading } = useBrands();

  return <InventoryPage brands={brands} brandsLoading={loading} />;
}
