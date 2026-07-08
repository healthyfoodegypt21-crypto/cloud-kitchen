import { useInventory } from '@/hooks/useInventory';
import PurchasesPage from '@/pages/Purchases';

export default function PurchasesRoute() {
  const { items, loading: inventoryLoading, storageMode, fallbackReason } = useInventory();

  return (
    <PurchasesPage
      inventoryItems={items}
      inventoryLoading={inventoryLoading}
      storageMode={storageMode}
      fallbackReason={fallbackReason}
    />
  );
}